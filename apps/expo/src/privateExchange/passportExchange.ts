/**
 * The two private passport actions (docs/ref/16 §4, §11):
 *   - ask a saved person for passport claims (no Face ID: a request releases
 *     nothing but my public Page);
 *   - answer a request: fixed order — the holder already chose claims on the
 *     consent sheet → Face ID (red line `sendPrivate`) → the device key signs
 *     the statement → only then is anything sent.
 * Failures are tagged; nothing private is logged.
 */
import {
  buildPassportPresentation,
  buildProofRequestRumor,
  buildProofResponseRumor,
  bytesToHex,
  err,
  ok,
  MAX_REQUEST_LIFETIME_SECONDS,
  type PassportRequestClaim,
  type ProfileRecord,
  type Result,
} from '@solidarity/shared';
import { randomBytes } from '@noble/hashes/utils.js';

import { translate } from '@/i18n';
import { requireSensitiveAction } from '@/keychain/biometricGatekeeper';
import { getNostrPubkey } from '@/nostr/userKey';
import { readPassportPrivateClaims, type PassportPrivateClaims } from '@/passport/privateClaims';
import { captureLocalDataEpoch } from '@/settings/localDataWipeBarrier';
import { deviceAttestSupported, signWithDeviceKey } from '@/witness/deviceKey';

import { myEmbeddablePage, recipientHexOf, sendRumor, type PrivateSendFailure } from './send';
import { usePrivateExchangeStore, type IncomingPassportRequest } from './store';

export async function sendPassportRequest(
  record: ProfileRecord,
  claims: readonly PassportRequestClaim[]
): Promise<Result<string, PrivateSendFailure>> {
  const recipientHex = recipientHexOf(record);
  if (recipientHex === null) return err('recipientNoNostr');
  const page = myEmbeddablePage();
  if (!page.ok) return page;

  const epoch = captureLocalDataEpoch();
  const nonce = bytesToHex(randomBytes(32));
  const sentAt = Math.floor(Date.now() / 1000);
  const exp = sentAt + MAX_REQUEST_LIFETIME_SECONDS;
  const sent = await sendRumor(
    buildProofRequestRumor({ recipientHex, claims, nonce, exp, ...(page.value === undefined ? {} : { page: page.value }) }),
    recipientHex
  );
  if (!sent.ok) return sent;
  usePrivateExchangeStore
    .getState()
    .addOutgoing({ id: sent.value, recipientDid: record.did, recipientHex, claims, nonce, exp, sentAt, answer: null }, epoch);
  return sent;
}

/** What this phone could disclose for `request`, or why it can't. */
export function passportClaimsFor(
  request: Pick<IncomingPassportRequest, 'claims'>
): { readonly stored: PassportPrivateClaims | null; readonly available: readonly PassportRequestClaim[] } {
  const stored = readPassportPrivateClaims();
  if (stored === null) return { stored, available: [] };
  const available = request.claims.filter((claim) =>
    claim === 'passport.name' ? stored.name !== undefined : stored.nationality !== undefined
  );
  return { stored, available };
}

export type PassportAnswerFailure =
  | PrivateSendFailure
  | 'noPassport'
  | 'nothingChosen'
  | 'faceIdDenied'
  | 'expired'
  | 'deviceSignFailed';

export interface PassportAnswerSent {
  /** False when this phone could not attest its key: the requester sees L1. */
  readonly deviceAttested: boolean;
}

export async function answerPassportRequest(
  request: IncomingPassportRequest,
  chosen: readonly PassportRequestClaim[]
): Promise<Result<PassportAnswerSent, PassportAnswerFailure>> {
  if (chosen.length === 0) return err('nothingChosen');
  if (request.exp <= Math.floor(Date.now() / 1000)) return err('expired');
  const { stored, available } = passportClaimsFor(request);
  if (stored === null || chosen.some((c) => !available.includes(c))) return err('noPassport');
  const page = myEmbeddablePage();
  if (!page.ok) return page;

  const gate = await requireSensitiveAction('sendPrivate', translate('security.prompt.sendPrivate'));
  if (!gate.success) return err('faceIdDenied');

  const me = await getNostrPubkey();
  if (!me.ok) return err('noNostrKey');
  const epoch = captureLocalDataEpoch();
  const statement = buildPassportPresentation({
    holderHex: me.value,
    audHex: request.senderHex,
    nonce: request.nonce,
    claims: { ...(stored.name === undefined ? {} : { name: stored.name }), ...(stored.nationality === undefined ? {} : { nationality: stored.nationality }) },
    chosen,
    chip: stored.chip,
    readAt: stored.readAt,
    signedAt: Math.floor(Date.now() / 1000),
  });
  if (!statement.ok) return err('noPassport');

  const device = await signWithDeviceKey(me.value, statement.value);
  // A phone that can attest must not quietly send a weaker (L1) answer.
  if (!device.ok && deviceAttestSupported()) return err('deviceSignFailed');
  const sent = await sendRumor(
    buildProofResponseRumor({
      recipientHex: request.senderHex,
      requestId: request.id,
      passport: { statement: statement.value, device: device.ok ? device.value : null },
      ...(page.value === undefined ? {} : { page: page.value }),
    }),
    request.senderHex
  );
  if (!sent.ok) return sent;
  usePrivateExchangeStore.getState().setIncomingStatus(request.id, 'answered', epoch);
  return ok({ deviceAttested: device.ok });
}

export function dismissPassportRequest(id: string): void {
  usePrivateExchangeStore.getState().setIncomingStatus(id, 'dismissed', captureLocalDataEpoch());
}
