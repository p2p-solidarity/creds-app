/**
 * Private credential presentation over NIP-17 (docs/ref/16 §12):
 *   - ask a saved person for "a credential" (purpose only; they pick);
 *   - answer: fixed order — the holder picked a credential (and SD-JWT
 *     fields) on the consent sheet → Face ID (red line `sendPrivate`) → the
 *     signing key signs the VP → the root key signs the cardKeyBinding →
 *     only then is anything sent.
 * Only credentials this phone can honestly present are offered: JWT-VC or
 * SD-JWT, issuer signature checked on import, bound to this signing key,
 * not expired.
 */
import {
  buildCardKeyBindingJws,
  buildCredentialRequestRumor,
  buildCredentialResponseRumor,
  bytesToHex,
  didKeyFromJwk,
  err,
  MAX_REQUEST_LIFETIME_SECONDS,
  ok,
  oidcAuthRequestSchema,
  type ProfileRecord,
  type Result,
} from '@solidarity/shared';
import { randomBytes } from '@noble/hashes/utils.js';

import {
  classifyCredentialFormat,
  decodeSdDisclosure,
  parseSdJwt,
} from '@/credentials/selectiveDisclosure';
import { useCredentialStore, type StoredCredential } from '@/credentials/store';
import { translate } from '@/i18n';
import type { ProvableClaimEntity } from '@/identity/entities';
import { getRootDid, getRootSigner } from '@/identity/rootKey';
import { requireSensitiveAction } from '@/keychain/biometricGatekeeper';
import { publicJwk } from '@/keychain/signingKey';
import { buildVpToken } from '@/oidc/presenter';
import { captureLocalDataEpoch } from '@/settings/localDataWipeBarrier';

import { audienceFor, myEmbeddablePage, recipientHexOf, sendRumor, type PrivateSendFailure } from './send';
import { usePrivateExchangeStore, type IncomingCredentialRequest } from './store';

export interface PresentableCredential {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly issuerDid: string;
  /** Issued by this phone's own key: presenting it proves nothing about me. */
  readonly selfIssued: boolean;
  /** SD-JWT: the named fields the holder may pick from. Empty = the whole credential only. */
  readonly fields: readonly string[];
}

function sdFieldNames(rawJwt: string): readonly string[] {
  const parsed = parseSdJwt(rawJwt);
  if (!parsed.ok) return [];
  const names: string[] = [];
  for (const d of parsed.value.disclosures) {
    const name = decodeSdDisclosure(d)?.name;
    if (name !== undefined && !names.includes(name)) names.push(name);
  }
  return names;
}

export async function listPresentableCredentials(): Promise<readonly PresentableCredential[]> {
  const store = useCredentialStore.getState();
  await store.hydrate();
  const holderDid = didKeyFromJwk(await publicJwk());
  const now = Date.now();
  const out: PresentableCredential[] = [];
  for (const c of useCredentialStore.getState().details.values()) {
    if (c.metadataTags.includes('unverified') || c.holderDid !== holderDid) continue;
    if (c.expiresAt !== undefined && c.expiresAt.getTime() <= now) continue;
    const format = classifyCredentialFormat(c.rawJwt);
    if (format !== 'jwt-vc' && format !== 'sd-jwt') continue;
    out.push({
      id: c.id,
      title: c.title,
      type: c.type,
      issuerDid: c.issuerDid,
      selfIssued: c.issuerDid === holderDid,
      fields: format === 'sd-jwt' ? sdFieldNames(c.rawJwt) : [],
    });
  }
  return out;
}

export async function sendCredentialRequest(
  record: ProfileRecord,
  purpose: string
): Promise<Result<string, PrivateSendFailure>> {
  const recipientHex = recipientHexOf(record);
  if (recipientHex === null) return err('recipientNoNostr');
  const page = myEmbeddablePage();
  if (!page.ok) return page;

  const epoch = captureLocalDataEpoch();
  const nonce = bytesToHex(randomBytes(32));
  const sentAt = Math.floor(Date.now() / 1000);
  const exp = sentAt + MAX_REQUEST_LIFETIME_SECONDS;
  const trimmed = purpose.trim().slice(0, 140);
  const sent = await sendRumor(
    buildCredentialRequestRumor({
      recipientHex,
      nonce,
      exp,
      ...(trimmed === '' ? {} : { purpose: trimmed }),
      ...(page.value === undefined ? {} : { page: page.value }),
    }),
    recipientHex
  );
  if (!sent.ok) return sent;
  usePrivateExchangeStore.getState().addCredentialOutgoing(
    { id: sent.value, recipientDid: record.did, recipientHex, purpose: trimmed === '' ? null : trimmed, nonce, exp, sentAt, answer: null },
    epoch
  );
  return sent;
}

export type CredentialAnswerFailure =
  | PrivateSendFailure
  | 'expired'
  | 'notPresentable'
  | 'nothingChosen'
  | 'faceIdDenied'
  | 'signFailed';

/** Synthetic claims so the presenter's own SD-JWT redaction keeps only the picked fields. */
function fieldClaims(credential: StoredCredential, fields: readonly string[]): readonly ProvableClaimEntity[] {
  const at = new Date();
  return fields.map((name) => ({
    id: `${credential.id}#${name}`,
    identityCardId: credential.id,
    claimType: name,
    title: name,
    issuerType: 'wallet',
    trustLevel: credential.trustLevel,
    source: 'privateExchange',
    payload: '',
    isPresentable: true,
    createdAt: at,
    updatedAt: at,
  }));
}

export async function answerCredentialRequest(
  request: IncomingCredentialRequest,
  choice: { readonly credentialId: string; readonly fields: readonly string[] | null }
): Promise<Result<void, CredentialAnswerFailure>> {
  if (request.exp <= Math.floor(Date.now() / 1000)) return err('expired');
  const presentable = (await listPresentableCredentials()).find((c) => c.id === choice.credentialId);
  const credential = useCredentialStore.getState().details.get(choice.credentialId);
  if (presentable === undefined || credential === undefined) return err('notPresentable');
  if (choice.fields !== null && choice.fields.length === 0) return err('nothingChosen');
  if (choice.fields?.some((f) => !presentable.fields.includes(f))) return err('notPresentable');
  const aud = audienceFor(request.senderHex);
  if (aud === null) return err('wrapFailed');
  const page = myEmbeddablePage();
  if (!page.ok) return page;

  const gate = await requireSensitiveAction('sendPrivate', translate('security.prompt.sendPrivate'));
  if (!gate.success) return err('faceIdDenied');

  const epoch = captureLocalDataEpoch();
  const partial = choice.fields !== null && choice.fields.length < presentable.fields.length;
  const claims = partial ? fieldClaims(credential, presentable.fields) : [];
  const holderDid = didKeyFromJwk(await publicJwk());
  const built = await buildVpToken({
    request: { request: oidcAuthRequestSchema.parse({ client_id: aud, nonce: request.nonce }), source: 'queryparams' },
    selectedClaimIds: partial ? (choice.fields ?? []).map((f) => `${credential.id}#${f}`) : [credential.id],
    holderDid,
    expiresAt: request.exp,
    deps: { getProvableClaims: () => claims },
  });
  if (!built.ok) return err('signFailed');

  const [rootDid, rootSigner] = await Promise.all([getRootDid(), getRootSigner()]);
  if (!rootDid.ok || !rootSigner.ok) return err('signFailed');
  let binding: string;
  try {
    binding = await buildCardKeyBindingJws({
      rootDid: rootDid.value,
      cardDid: holderDid,
      aud,
      nonce: request.nonce,
      iat: Math.floor(Date.now() / 1000),
      exp: request.exp,
      sign: rootSigner.value,
    });
  } catch {
    return err('signFailed');
  }

  const sent = await sendRumor(
    buildCredentialResponseRumor({
      recipientHex: request.senderHex,
      requestId: request.id,
      vp: built.value.vpJwt,
      binding,
      ...(page.value === undefined ? {} : { page: page.value }),
    }),
    request.senderHex
  );
  if (!sent.ok) return sent;
  usePrivateExchangeStore.getState().setCredentialIncomingStatus(request.id, 'answered', epoch);
  return ok(undefined);
}

export function dismissCredentialRequest(id: string): void {
  usePrivateExchangeStore.getState().setCredentialIncomingStatus(id, 'dismissed', captureLocalDataEpoch());
}
