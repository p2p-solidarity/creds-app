/**
 * Device-attested passport statements (docs/ref/11 §6.1, P1): "a genuine creds
 * app on real hardware read a passport chip that passed passive
 * authentication, for this npub". Replaces the retired passport ZK binding —
 * same trust as a witness (Apple/Google + an unmodified phone), and the web can
 * check it in plain TS.
 *
 * One replaceable NIP-78 event per holder (`d = creds.passport`), re-signed by
 * the owner's app every 30 days. The nullifier is present only when the owner
 * opted in to being a passport witness (Q3): anyone holding the chip data —
 * the issuing state included — can compute it and find this npub.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { z } from 'zod';

import { bytesToHex } from '../crypto';
import { verifyNostrEvent, type NostrEvent, type UnsignedNostrEvent } from '../nostr/event';
import { npubToHex } from '../nostr/npub';
import { err, ok, type Result } from '../types/result';
import { WITNESS_EVENT_KIND, WITNESS_LAPSE_SECONDS, deviceProofSchema, verifyDeviceProof, type DeviceProof, type DeviceProofTrust } from './witness';

export const PASSPORT_STATEMENT_D_TAG = 'creds.passport';
const FUTURE_SKEW_SECONDS = 300;

const statementSchema = z
  .object({
    v: z.literal(1),
    /** npub of the passport holder (the event author). */
    holder: z.string().startsWith('npub1'),
    /** From DG1 on the chip, at read time. */
    ageOver18: z.boolean(),
    /** `passportNullifier(SOD)`; only when the holder opted in to counting. */
    nullifier: z.string().regex(/^[0-9a-f]{64}$/u).optional(),
    /** When the chip was read (unix s). */
    readAt: z.number().int().positive(),
    /** When this statement was signed (unix s); re-signed every 30 days. */
    signedAt: z.number().int().positive(),
  })
  .strict()
  .refine((s) => s.readAt <= s.signedAt);
export type PassportStatement = z.infer<typeof statementSchema>;

const contentSchema = z.object({ statement: z.string().max(1024), device: deviceProofSchema }).strict();

export interface VerifiedPassportStatement {
  readonly statement: PassportStatement;
  readonly holderHex: string;
  /** SHA-256 of the device public key (hex) — the "holder" for conflicts (Q4). */
  readonly deviceKey: string;
}

/** One value per passport document: SHA-256 over a domain tag and the SOD's hash. */
export function passportNullifier(sod: Uint8Array): string {
  const prefix = new TextEncoder().encode('creds.passport.nullifier:v1:');
  const sodHash = sha256(sod);
  const preimage = new Uint8Array(prefix.length + sodHash.length);
  preimage.set(prefix);
  preimage.set(sodHash, prefix.length);
  return bytesToHex(sha256(preimage));
}

/** The statement is signed as these exact bytes, so it travels as a string. */
export function buildPassportEvent(statement: PassportStatement, device: DeviceProof): UnsignedNostrEvent {
  const tags = [['d', PASSPORT_STATEMENT_D_TAG]];
  if (statement.nullifier !== undefined) tags.push(['n', statement.nullifier]);
  return {
    kind: WITNESS_EVENT_KIND,
    tags,
    content: JSON.stringify({ statement: JSON.stringify(statement), device }),
    created_at: statement.signedAt,
  };
}

export function verifyPassportStatement(
  event: NostrEvent,
  trust: DeviceProofTrust,
  nowSeconds: number,
): Result<VerifiedPassportStatement, string> {
  if (event.kind !== WITNESS_EVENT_KIND || event.tags.find((t) => t[0] === 'd')?.[1] !== PASSPORT_STATEMENT_D_TAG) {
    return err('not a passport statement');
  }
  if (!verifyNostrEvent(event)) return err('nostr signature does not verify');

  let content: z.infer<typeof contentSchema>;
  let statement: PassportStatement;
  try {
    content = contentSchema.parse(JSON.parse(event.content));
    statement = statementSchema.parse(JSON.parse(content.statement));
  } catch {
    return err('malformed passport statement');
  }
  const holderHex = npubToHex(statement.holder);
  if (!holderHex.ok) return err('malformed npub');
  if (holderHex.value.toLowerCase() !== event.pubkey.toLowerCase()) return err('statement is not by the event author');
  if (event.tags.find((t) => t[0] === 'n')?.[1] !== statement.nullifier) return err('n tag does not match the statement');
  if (statement.signedAt > nowSeconds + FUTURE_SKEW_SECONDS || nowSeconds - statement.signedAt > WITNESS_LAPSE_SECONDS) {
    return err('statement is not current');
  }
  if (content.device.platform === 'notary') return err('a passport needs a device proof');

  const device = verifyDeviceProof(content.device, new TextEncoder().encode(content.statement), holderHex.value, statement.signedAt * 1000, trust);
  if (!device.ok) return device;
  return ok({ statement, holderHex: holderHex.value.toLowerCase(), deviceKey: bytesToHex(sha256(device.value)) });
}

/**
 * How many distinct passports stand behind `witnessHexes` (Q3/Q4). Only
 * statements that carry a nullifier count. A nullifier signed by more than one
 * device key is contested — someone else holds a copy of that chip's data —
 * and counts for no one: without a server nobody can tell who was first.
 * `statements` must already be verified and current, and should include every
 * statement found for those nullifiers, not only the witnesses' own.
 */
export function countPassportWitnesses(
  statements: readonly VerifiedPassportStatement[],
  witnessHexes: ReadonlySet<string>,
): number {
  const keysByNullifier = new Map<string, Set<string>>();
  const holdersByNullifier = new Map<string, Set<string>>();
  for (const s of statements) {
    const n = s.statement.nullifier;
    if (n === undefined) continue;
    (keysByNullifier.get(n) ?? keysByNullifier.set(n, new Set()).get(n)!).add(s.deviceKey);
    (holdersByNullifier.get(n) ?? holdersByNullifier.set(n, new Set()).get(n)!).add(s.holderHex);
  }
  const lowerWitnesses = new Set([...witnessHexes].map((h) => h.toLowerCase()));
  let count = 0;
  for (const [n, keys] of keysByNullifier) {
    if (keys.size !== 1) continue;
    if ([...(holdersByNullifier.get(n) ?? [])].some((h) => lowerWitnesses.has(h))) count += 1;
  }
  return count;
}
