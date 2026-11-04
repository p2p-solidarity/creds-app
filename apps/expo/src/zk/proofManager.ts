/**
 * Verify-only selective-disclosure proof check for old-format zkProof QR
 * envelopes (removed together with those wires, 10 §4).
 *
 * Canonical signing data: `businessCardId|<sorted-field-list>|<recipient ?? "">|<unix-seconds>`
 * (UTF-8). Signature: raw P-256 ECDSA `r||s` (64 bytes).
 */
import {
  base64Decode,
  utf8ToBytes,
  type BusinessCardField,
} from '@solidarity/shared';
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { wrapRawSigningInputForSpruce } from '@/keychain/signingKey';

const ALL_FIELDS: readonly BusinessCardField[] = [
  'name',
  'title',
  'company',
  'email',
  'phone',
  'profileImage',
  'socialNetworks',
  'skills',
];

export interface SelectiveDisclosureProof {
  readonly proofId: string;
  readonly businessCardId: string;
  /** BusinessCardField → revealed UTF-8 value. Set excludes "name" only when
   * the user explicitly omits it (which the resolver prevents). */
  readonly disclosedFields: Readonly<Partial<Record<BusinessCardField, string>>>;
  /** BusinessCardField → base64(0x02 || sha256 digest). 33 raw bytes per entry. */
  readonly fieldCommitments: Readonly<Partial<Record<BusinessCardField, string>>>;
  readonly recipientId?: string;
  /** base64 of raw P-256 ECDSA signature (64 bytes: r||s). */
  readonly signature: string;
  /** base64 of raw P-256 public key (64 bytes: X||Y, no leading 0x04). */
  readonly signerPublicKey?: string;
  /** ISO 8601, matches `formatSwiftIso8601`. */
  readonly createdAt: string;
  /** ISO 8601, 24h after createdAt. Mirrors Swift Calendar.current.date(byAdding:.hour, value:24). */
  readonly expiresAt: string;
  /**
   * Internal marker so the verifier knows which signing-input wrapper to
   * apply. `'expo-v2'` = `signRawEs256` JWS wrapping (this file).
   * `'swift-v2'` = raw bytes ECDSA (Swift Codable path). When absent, we
   * assume `'swift-v2'` for backwards compatibility.
   */
  readonly format?: 'expo-v2' | 'swift-v2';
}

export interface ProofVerificationResult {
  readonly isValid: boolean;
  readonly reason?: string;
}

/**
 * Canonical signing payload — `businessCardId|<sorted-fields>|<recipient>|<unix-secs>`.
 * Matches Swift `canonicalProofSigningData(businessCardId:selectedFields:recipientId:timestamp:)`
 * byte-for-byte.
 */
function canonicalSigningBytes(args: {
  readonly businessCardId: string;
  readonly selectedFields: ReadonlySet<BusinessCardField>;
  readonly recipientId?: string;
  readonly timestamp: Date;
}): Uint8Array {
  const sorted = [...args.selectedFields].sort();
  const ts = Math.floor(args.timestamp.getTime() / 1000).toString();
  const recipient = args.recipientId ?? '';
  const canonical = [
    args.businessCardId,
    sorted.join(','),
    recipient,
    ts,
  ].join('|');
  return utf8ToBytes(canonical);
}

/**
 * Verify a selective-disclosure proof. Checks expiration, business-card
 * identifier match, and the ECDSA signature over the canonical payload.
 *
 * Cross-platform: `proof.format` selects which signing-input rule to apply.
 * Expo v2 now signs SHA-256(canonical) through native raw P-256, matching
 * Swift's raw signature format without the old Spruce JWS wrapper.
 *
 * `signerPublicKey` is mandatory in v2. Returns `{ isValid: false }`
 * with a reason when missing — the legacy fallback to the local
 * KeyManager pair (Swift line 162-195) is out of scope for the Expo
 * port because the hardware-backed key never reaches JS.
 */
// Async signature kept for parity with Swift `verifySelectiveDisclosureProof`
// (returns `Result`; future iterations may need to await trust-anchor lookups
// or device-key resolution, neither of which has landed yet).
// eslint-disable-next-line @typescript-eslint/require-await
export async function verifySelectiveDisclosureProof(
  proof: SelectiveDisclosureProof,
  expectedBusinessCardId: string,
  now: Date = new Date()
): Promise<ProofVerificationResult> {
  // 1. Expiration.
  const expiresAt = parseIsoDate(proof.expiresAt);
  if (!expiresAt || expiresAt.getTime() < now.getTime()) {
    return { isValid: false, reason: 'Proof has expired' };
  }

  // 2. Business-card ID match.
  if (proof.businessCardId !== expectedBusinessCardId) {
    return { isValid: false, reason: 'Business card ID mismatch' };
  }

  // 3. Reconstruct canonical signing bytes.
  const createdAt = parseIsoDate(proof.createdAt);
  if (!createdAt) {
    return { isValid: false, reason: 'Failed to reconstruct proof data' };
  }
  const selectedFields = new Set<BusinessCardField>(
    Object.keys(proof.disclosedFields).filter((k): k is BusinessCardField =>
      (ALL_FIELDS as readonly string[]).includes(k)
    )
  );
  const canonical = canonicalSigningBytes({
    businessCardId: proof.businessCardId,
    selectedFields,
    recipientId: proof.recipientId,
    timestamp: createdAt,
  });

  // 4. Decode signature + public key.
  let sigBytes: Uint8Array;
  let pubBytes: Uint8Array;
  try {
    sigBytes = base64Decode(proof.signature);
  } catch {
    return { isValid: false, reason: 'Malformed signature' };
  }
  if (sigBytes.length !== 64) {
    return { isValid: false, reason: 'Invalid signature length' };
  }
  if (!proof.signerPublicKey) {
    return { isValid: false, reason: 'Missing signerPublicKey (v2 required)' };
  }
  try {
    pubBytes = base64Decode(proof.signerPublicKey);
  } catch {
    return { isValid: false, reason: 'Malformed signerPublicKey' };
  }
  if (pubBytes.length !== 64) {
    return { isValid: false, reason: 'Invalid signerPublicKey length' };
  }

  // 5. ECDSA verify. `wrapRawSigningInputForSpruce` returns the digest that
  //    native signed for Expo v2; Swift v2 signs SHA-256(canonical).
  const uncompressed = new Uint8Array(65);
  uncompressed[0] = 0x04;
  uncompressed.set(pubBytes, 1);

  // For Expo-generated proofs, the signed input is the JWS signing-input
  // bytes that wrap the canonical proof bytes. For Swift-generated proofs,
  // it's the canonical bytes directly. We try the platform that matches
  // `format`; if absent, fall back to "swift-v2" since pre-format proofs
  // came from Swift.
  const inputs: readonly Uint8Array[] =
    proof.format === 'expo-v2'
      ? [wrapRawSigningInputForSpruce(canonical)]
      : [sha256(canonical)];

  for (const input of inputs) {
    try {
      if (p256.verify(sigBytes, input, uncompressed, { prehash: false })) {
        return { isValid: true };
      }
    } catch {
      // Malformed signature bytes — fall through to the next format
      // candidate (none right now) or the invalid path.
    }
  }
  return { isValid: false, reason: 'Invalid signature' };
}

/**
 * Strict ISO 8601 parse. Returns null on malformed inputs so the caller
 * surfaces "Failed to reconstruct proof data" instead of throwing.
 */
function parseIsoDate(value: string): Date | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** @internal — exposed so tests can pin the canonical signing bytes. */
export const _internal = { canonicalSigningBytes } as const;
