/**
 * Witness statements (docs/ref/10 §3.11): "my phone checked this Page's
 * claim". Published by the witness as a NIP-78 event, only when they tap
 * "witness"; the owner's own self-proof uses the same format with
 * `witness === subject`.
 *
 * Two signatures, two jobs. The nostr signature says which person stands
 * behind the statement. The device signature (App Attest assertion, or an
 * Android Key Attestation key) says a genuine, unmodified creds app on real
 * hardware made it — the attested key is bound to the witness's npub through
 * the attestation challenge, so it cannot be lent to another identity. A
 * phone can mint many attested keys, so this does not count distinct devices;
 * distinct people come from the passport nullifier.
 */
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { z } from 'zod';

import { base64Decode, bytesToHex } from '../crypto';
import { verifyNostrEvent, type NostrEvent, type UnsignedNostrEvent } from '../nostr/event';
import { npubToHex } from '../nostr/npub';
import { err, ok, type Result } from '../types/result';
import { verifyAndroidKeyAttestation } from './androidKeyAttestation';
import { verifyAppAttestAssertion, verifyAppAttestation, type AppAttestEnvironment } from './appAttest';

export const WITNESS_EVENT_KIND = 30078;
export const WITNESS_D_PREFIX = 'creds.witness:';
const CLAIM_RE = /^(?:(?:x|telegram|github|threads):@[A-Za-z0-9_.-]+|website:[a-z0-9.-]+)$/u;

const statementSchema = z
  .object({
    v: z.literal(1),
    /** The Page claim checked, e.g. `x:@alice` (§3.5 `pageSocialClaim`). */
    claim: z.string().regex(CLAIM_RE),
    /** The creds.id name whose marker was found. */
    name: z.string().regex(/^[a-z0-9]{3,30}$/u),
    /** npub of the Page owner. */
    subject: z.string().startsWith('npub1'),
    /** npub of the person whose phone checked it. */
    witness: z.string().startsWith('npub1'),
    /** When the phone fetched the platform page (unix seconds). */
    observedAt: z.number().int().positive(),
  })
  .strict();
export type WitnessStatement = z.infer<typeof statementSchema>;

export type DeviceProof =
  | { readonly platform: 'ios'; readonly attestation: string; readonly keyId: string; readonly assertion: string }
  | { readonly platform: 'android'; readonly chain: readonly string[]; readonly signature: string }
  /** The Pro notary (creds.id) fetched the page itself; trusted by its pinned npub, not a device. */
  | { readonly platform: 'notary' };

export const deviceProofSchema = z.union([
  z.object({ platform: z.literal('ios'), attestation: z.string(), keyId: z.string(), assertion: z.string() }).strict(),
  z.object({ platform: z.literal('android'), chain: z.array(z.string()).min(2).max(8), signature: z.string() }).strict(),
  z.object({ platform: z.literal('notary') }).strict(),
]);
const contentSchema = z.object({ statement: z.string().max(2048), device: deviceProofSchema }).strict();

/** Who we accept device proofs from: our app IDs and the pinned vendor roots. */
export interface DeviceProofTrust {
  readonly appleAppId: string;
  readonly appleEnvironment: AppAttestEnvironment;
  readonly appleRoots: readonly Uint8Array[];
  readonly androidPackage: string;
  readonly androidSignatureDigests: readonly Uint8Array[];
  readonly googleRoots: readonly Uint8Array[];
  readonly revokedSerials?: ReadonlySet<string>;
  /** Hex pubkeys of the creds.id Pro notary; a `notary` witness from anyone else is refused. */
  readonly notaryPubkeys: readonly string[];
}

export interface VerifiedWitness {
  readonly statement: WitnessStatement;
  readonly platform: DeviceProof['platform'];
  /** SHA-256 of the device public key (hex) — identifies the key, not the phone. Empty for the notary. */
  readonly deviceKey: string;
  /** The owner proving their own claim. */
  readonly self: boolean;
}

/** The attestation challenge that binds a device key to one nostr identity. */
export function deviceKeyChallenge(pubkeyHex: string): Uint8Array {
  return sha256(new TextEncoder().encode(`creds.devicekey:v1:${pubkeyHex.toLowerCase()}`));
}

export function witnessDTag(claim: string, subjectHex: string): string {
  return `${WITNESS_D_PREFIX}${claim}:${subjectHex.toLowerCase()}`;
}

/** The statement is signed as these exact bytes, so it travels as a string. */
export function buildWitnessEvent(statement: WitnessStatement, device: DeviceProof): UnsignedNostrEvent {
  const subjectHex = npubToHex(statement.subject);
  return {
    kind: WITNESS_EVENT_KIND,
    tags: [['d', witnessDTag(statement.claim, subjectHex.ok ? subjectHex.value : '')]],
    content: JSON.stringify({ statement: JSON.stringify(statement), device }),
    created_at: statement.observedAt,
  };
}

/**
 * Verify `device` signed `signedBytes` with a key attested for `witnessHex`
 * (or is the pinned notary). Returns the device public key (empty for the notary).
 */
export function verifyDeviceProof(
  device: z.infer<typeof deviceProofSchema>,
  signedBytes: Uint8Array,
  witnessHex: string,
  at: number,
  trust: DeviceProofTrust,
): Result<Uint8Array, string> {
  if (device.platform === 'notary') {
    return trust.notaryPubkeys.includes(witnessHex.toLowerCase()) ? ok(new Uint8Array()) : err('not the creds.id notary');
  }
  const challenge = deviceKeyChallenge(witnessHex);
  try {
    if (device.platform === 'ios') {
      const attested = verifyAppAttestation({
        attestationObject: base64Decode(device.attestation),
        keyId: base64Decode(device.keyId),
        clientDataHash: challenge,
        appId: trust.appleAppId,
        environment: trust.appleEnvironment,
        roots: trust.appleRoots,
        at,
      });
      if (!attested.ok) return attested;
      const asserted = verifyAppAttestAssertion({
        assertion: base64Decode(device.assertion),
        clientData: signedBytes,
        publicKey: attested.value.publicKey,
        appId: trust.appleAppId,
      });
      return asserted.ok ? ok(attested.value.publicKey) : asserted;
    }
    const attested = verifyAndroidKeyAttestation({
      chain: device.chain.map(base64Decode),
      challenge,
      packageName: trust.androidPackage,
      signatureDigests: trust.androidSignatureDigests,
      roots: trust.googleRoots,
      at,
      ...(trust.revokedSerials ? { revokedSerials: trust.revokedSerials } : {}),
    });
    if (!attested.ok) return attested;
    const key = attested.value.publicKey;
    if (key.kind !== 'ec' || key.curve !== 'p256') return err('device key is not P-256');
    const valid = p256.verify(base64Decode(device.signature), signedBytes, key.point, { format: 'der', lowS: false });
    return valid ? ok(key.point) : err('device signature does not verify');
  } catch {
    return err('malformed device proof');
  }
}

export function verifyWitness(event: NostrEvent, trust: DeviceProofTrust): Result<VerifiedWitness, string> {
  if (event.kind !== WITNESS_EVENT_KIND) return err('not a witness event');
  if (!verifyNostrEvent(event)) return err('nostr signature does not verify');

  let content: z.infer<typeof contentSchema>;
  let statement: WitnessStatement;
  try {
    content = contentSchema.parse(JSON.parse(event.content));
    statement = statementSchema.parse(JSON.parse(content.statement));
  } catch {
    return err('malformed witness statement');
  }
  const witnessHex = npubToHex(statement.witness);
  const subjectHex = npubToHex(statement.subject);
  if (!witnessHex.ok || !subjectHex.ok) return err('malformed npub');
  if (witnessHex.value.toLowerCase() !== event.pubkey.toLowerCase()) return err('statement is not by the event author');
  const d = event.tags.find((t) => t[0] === 'd')?.[1];
  if (d !== witnessDTag(statement.claim, subjectHex.value)) return err('d tag is for another claim');

  const device = verifyDeviceProof(content.device, new TextEncoder().encode(content.statement), witnessHex.value, statement.observedAt * 1000, trust);
  if (!device.ok) return device;
  return ok({
    statement,
    platform: content.device.platform,
    deviceKey: content.device.platform === 'notary' ? '' : bytesToHex(sha256(device.value)),
    self: statement.witness === statement.subject,
  });
}

/** Witnesses older than this no longer count (docs/ref/10 §3.11 defaults). */
export const WITNESS_LAPSE_SECONDS = 90 * 86_400;
/** Clock skew tolerated on `observedAt`. */
const FUTURE_SKEW_SECONDS = 300;

export interface WitnessSummary {
  /** The owner's own device-attested check (cold start), newest. */
  readonly self: VerifiedWitness | null;
  /** Other people's witnesses, newest per witness npub. */
  readonly others: readonly VerifiedWitness[];
  /** Newest `observedAt` across both (unix s), or null. */
  readonly latestAt: number | null;
}

/**
 * Every valid, current witness of one Page claim. The subject npub and name
 * come from the Page the caller already verified; witnesses for anything else
 * are dropped. The owner cannot witness themselves twice: a witness signed by
 * the same device key as the owner's own check is not counted.
 */
export function summarizeWitnesses(
  events: readonly NostrEvent[],
  page: { readonly subject: string; readonly claim: string; readonly name: string },
  trust: DeviceProofTrust,
  nowSeconds: number,
): WitnessSummary {
  const valid: VerifiedWitness[] = [];
  for (const event of events) {
    const w = verifyWitness(event, trust);
    if (!w.ok) continue;
    const s = w.value.statement;
    if (s.subject !== page.subject || s.claim !== page.claim || s.name !== page.name) continue;
    if (s.observedAt > nowSeconds + FUTURE_SKEW_SECONDS || nowSeconds - s.observedAt > WITNESS_LAPSE_SECONDS) continue;
    valid.push(w.value);
  }
  valid.sort((a, b) => b.statement.observedAt - a.statement.observedAt);
  const self = valid.find((w) => w.self) ?? null;
  const ownerKeys = new Set(valid.filter((w) => w.self).map((w) => w.deviceKey));
  const seen = new Set<string>();
  const others = valid.filter((w) => {
    if (w.self || (w.deviceKey !== '' && ownerKeys.has(w.deviceKey)) || seen.has(w.statement.witness)) return false;
    seen.add(w.statement.witness);
    return true;
  });
  return { self, others, latestAt: valid[0]?.statement.observedAt ?? null };
}
