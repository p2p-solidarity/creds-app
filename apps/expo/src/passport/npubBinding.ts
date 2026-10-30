/**
 * Passport → npub binding, device-attested (docs/ref/11 §6.1, P1). After a
 * real chip passes passive authentication, this phone's attested device key
 * signs a passport statement for the user's npub and publishes it; the app
 * re-signs it every 30 days in the background (the device key needs no Face
 * ID), until the passport expires. Viewers' apps and creds.id check it with the
 * same shared rules as witnesses — no circuit anywhere.
 *
 * The retired openac_show binding (docs/ref/11 §2.2) is gone: those proofs
 * were not bound to any issuing state.
 *
 * The nullifier is only included when the user opted in to being counted as a
 * passport witness (plan 11 Q3) — the issuing state, or anyone who read the
 * chip, can compute it and find this npub.
 */
import {
  CREDS_DEVICE_TRUST,
  PASSPORT_STATEMENT_D_TAG,
  WITNESS_EVENT_KIND,
  buildPassportEvent,
  countPassportWitnesses,
  err,
  ok,
  passportNullifier,
  verifyPassportStatement,
  type PassportStatement,
  type Result,
  type VerifiedPassportStatement,
} from '@solidarity/shared';

import type { NostrEvent } from '@/nostr/nostrAdapter';
import { getNostrPubkey, npubEncode, signNostrEvent } from '@/nostr/userKey';
import { dropDeviceKey, preloadDeviceKey, signWithDeviceKey, type DeviceKeyFailure } from '@/witness/deviceKey';
import { fetchEvents, publishWitness } from '@/witness/witness';

import {
  readStoredStatement,
  statementGeneration,
  writeStoredStatement,
  type StoredStatement,
} from './statementStore';

const RENEW_AFTER_MS = 30 * 86_400_000;
const RENEWAL_THROTTLE_MS = 60 * 60_000;

export type PassportStatementFailure = DeviceKeyFailure | 'noNostrKey' | 'deviceRejected' | 'passportDeleted';

async function signStatement(statement: PassportStatement, npubHex: string): Promise<Result<NostrEvent, PassportStatementFailure>> {
  const text = JSON.stringify(statement);
  const device = await signWithDeviceKey(npubHex, text);
  if (!device.ok) return device;
  const signed = await signNostrEvent(buildPassportEvent(statement, device.value));
  if (!signed.ok) return err('noNostrKey');
  const verified = verifyPassportStatement(signed.value, CREDS_DEVICE_TRUST, statement.signedAt);
  return verified.ok ? ok(signed.value) : err('deviceRejected');
}

async function signAndPublish(
  stored: Omit<StoredStatement, 'signedAt'>,
  relays: readonly string[],
  nowMs: number,
): Promise<Result<void, PassportStatementFailure>> {
  // A passport deleted while this signs must not get its statement back.
  const generation = statementGeneration();
  const holder = npubEncode(stored.npubHex);
  if (!holder.ok) return err('noNostrKey');
  const signedAt = Math.floor(nowMs / 1000);
  const statement: PassportStatement = {
    v: 1,
    holder: holder.value,
    ageOver18: stored.ageOver18,
    ...(stored.nullifier !== undefined ? { nullifier: stored.nullifier } : {}),
    readAt: Math.floor(stored.readAt / 1000),
    signedAt,
  };
  let event = await signStatement(statement, stored.npubHex);
  if (!event.ok && event.error === 'deviceRejected') {
    // The cached attestation no longer verifies (short-lived chain): attest a fresh key once.
    dropDeviceKey();
    event = await signStatement(statement, stored.npubHex);
  }
  if (!event.ok) return event;
  if (!writeStoredStatement({ ...stored, signedAt: signedAt * 1000 }, generation)) return err('passportDeleted');
  // Signed and stored is what makes it L3; relays can take seconds each, so
  // the publish finishes in the background instead of holding the save screen.
  void publishWitness(event.value, relays)
    .then((report) => {
      if (!report.success) console.warn(`[passport] statement reached ${String(report.acceptedCount)}/${String(report.requiredCount)} relays`);
    })
    .catch((e: unknown) => { console.warn('[passport] statement publish failed', e); });
  return ok(undefined);
}

/** Attest the device key while the user is still on the save step. */
export async function preloadPassportStatement(): Promise<void> {
  const npubHex = await getNostrPubkey();
  if (npubHex.ok) preloadDeviceKey(npubHex.value);
}

/**
 * Sign and publish the statement for a chip that just passed passive auth.
 * The caller only calls this for a real (not simulated) chip.
 */
export async function issuePassportStatement(
  input: {
    readonly sod: ArrayBuffer;
    readonly ageOver18: boolean;
    readonly readAt: Date;
    readonly passportExpiresAt: Date | null;
    /** The user opted in to being counted as a passport witness (Q3). */
    readonly countAsWitness: boolean;
    /** The passport credential being saved; deleting it stops renewals. */
    readonly credentialId: string;
  },
  relays: readonly string[],
): Promise<Result<void, PassportStatementFailure>> {
  const npubHex = await getNostrPubkey();
  if (!npubHex.ok) return err('noNostrKey');
  return signAndPublish(
    {
      npubHex: npubHex.value,
      ageOver18: input.ageOver18,
      ...(input.countAsWitness ? { nullifier: passportNullifier(new Uint8Array(input.sod)) } : {}),
      readAt: input.readAt.getTime(),
      passportExpiresAt: input.passportExpiresAt?.getTime() ?? null,
      credentialId: input.credentialId,
    },
    relays,
    Date.now(),
  );
}

let lastRenewalRun = 0;

/** Re-sign the statement once it is 30 days old (quiet; it lapses on its own if this keeps failing). */
export async function renewPassportStatement(relays: readonly string[], nowMs: number = Date.now()): Promise<void> {
  if (nowMs - lastRenewalRun < RENEWAL_THROTTLE_MS) return;
  lastRenewalRun = nowMs;
  const stored = readStoredStatement();
  if (stored === null || nowMs - stored.signedAt < RENEW_AFTER_MS) return;
  if (stored.passportExpiresAt !== null && stored.passportExpiresAt <= nowMs) return;
  const npubHex = await getNostrPubkey();
  // A new npub needs a fresh chip read: the old statement is for the old identity.
  if (!npubHex.ok || npubHex.value !== stored.npubHex) return;
  const renewed = await signAndPublish(stored, relays, nowMs);
  if (!renewed.ok) console.warn(`[passport] statement renewal failed — ${renewed.error}`);
}

function verifyAll(events: readonly NostrEvent[], nowSeconds: number): VerifiedPassportStatement[] {
  const out: VerifiedPassportStatement[] = [];
  for (const event of events) {
    const v = verifyPassportStatement(event, CREDS_DEVICE_TRUST, nowSeconds);
    if (v.ok) out.push(v.value);
  }
  return out;
}

/**
 * How many distinct passports stand behind `npubHexes` (a Page's witnesses).
 * Every other statement for the same passports is fetched too, so a passport
 * bound by two device keys is seen as contested and counts for no one.
 */
export async function countPassportHolders(npubHexes: readonly string[], relays: readonly string[]): Promise<number> {
  if (npubHexes.length === 0) return 0;
  const now = Math.floor(Date.now() / 1000);
  const own = verifyAll(
    await fetchEvents(relays, { kinds: [WITNESS_EVENT_KIND], authors: [...npubHexes], '#d': [PASSPORT_STATEMENT_D_TAG] }),
    now,
  );
  const nullifiers = [...new Set(own.flatMap((s) => (s.statement.nullifier === undefined ? [] : [s.statement.nullifier])))];
  if (nullifiers.length === 0) return 0;
  const all = verifyAll(
    await fetchEvents(relays, { kinds: [WITNESS_EVENT_KIND], '#d': [PASSPORT_STATEMENT_D_TAG], '#n': nullifiers }),
    now,
  );
  return countPassportWitnesses([...own, ...all], new Set(npubHexes));
}
