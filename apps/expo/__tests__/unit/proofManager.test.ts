/**
 * Verify-only selective-disclosure proofs on old zkProof QR envelopes.
 * Proofs are signed here the way the Swift app signed them (`swift-v2`:
 * raw P-256 over SHA-256 of the canonical bytes) with a fixed test key.
 */
import { beforeAll, describe, expect, it, mock } from 'bun:test';

import { base64Decode, base64Encode, type BusinessCardField } from '@solidarity/shared';
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';

const TEST_PRIV = new Uint8Array(32).fill(0x33);
// X||Y, 64 bytes — Swift `rawRepresentation`, no leading 0x04.
const TEST_PUB_RAW = p256.getPublicKey(TEST_PRIV, false).subarray(1);

interface TestProof {
  readonly proofId: string;
  readonly businessCardId: string;
  readonly disclosedFields: Readonly<Partial<Record<BusinessCardField, string>>>;
  readonly fieldCommitments: Readonly<Partial<Record<BusinessCardField, string>>>;
  readonly recipientId?: string;
  readonly signature: string;
  readonly signerPublicKey?: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly format?: 'expo-v2' | 'swift-v2';
}

interface ProofManagerSurface {
  readonly verifySelectiveDisclosureProof: (
    proof: TestProof,
    expectedBusinessCardId: string,
    now?: Date
  ) => Promise<{ readonly isValid: boolean; readonly reason?: string }>;
  readonly _internal: {
    readonly canonicalSigningBytes: (args: {
      readonly businessCardId: string;
      readonly selectedFields: ReadonlySet<BusinessCardField>;
      readonly recipientId?: string;
      readonly timestamp: Date;
    }) => Uint8Array;
  };
}

let mod: ProofManagerSurface;

beforeAll(async () => {
  // Export-complete signing-key mock: bun's mock.module is process-global and
  // a partial mock poisons later real-import files in the same run.
  await mock.module('@/keychain/signingKey', () => ({
    signRawEs256: async () => {
      throw new Error('test: not used by the verifier');
    },
    wrapRawSigningInputForSpruce: (payload: Uint8Array) => payload,
    ensureSigningKey: async () => ({
      alias: 'test.alias',
      publicJwk: { kty: 'EC', crv: 'P-256', alg: 'ES256', x: '', y: '' },
    }),
    publicJwk: async () => ({ kty: 'EC', crv: 'P-256', alg: 'ES256', x: '', y: '' }),
    signJwt: async () => 'signed.jwt.fake',
    resetSigningKeyForTesting: async () => undefined,
    hasExistingSigningKey: async () => false,
  }));
  mod = (await import('../../src/zk/proofManager')) as unknown as ProofManagerSurface;
});

const CARD_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const NOW = new Date('2026-05-25T12:00:00Z');

function signedProof(): TestProof {
  const canonical = mod._internal.canonicalSigningBytes({
    businessCardId: CARD_ID,
    selectedFields: new Set<BusinessCardField>(['name', 'title']),
    recipientId: 'recipient-1',
    timestamp: NOW,
  });
  const signature = p256.sign(sha256(canonical), TEST_PRIV, { prehash: false });
  return {
    proofId: 'proof-1',
    businessCardId: CARD_ID,
    disclosedFields: { name: 'Ada Lovelace', title: 'Founder' },
    fieldCommitments: {},
    recipientId: 'recipient-1',
    signature: base64Encode(signature),
    signerPublicKey: base64Encode(TEST_PUB_RAW),
    createdAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    format: 'swift-v2',
  };
}

describe('verifySelectiveDisclosureProof', () => {
  it('accepts a proof signed over the canonical bytes', async () => {
    const v = await mod.verifySelectiveDisclosureProof(signedProof(), CARD_ID, NOW);
    expect(v.isValid).toBe(true);
    expect(v.reason).toBeUndefined();
  });

  it('rejects when expectedBusinessCardId mismatches', async () => {
    const v = await mod.verifySelectiveDisclosureProof(signedProof(), 'wrong-card-id', NOW);
    expect(v.isValid).toBe(false);
    expect(v.reason).toBe('Business card ID mismatch');
  });

  it('rejects when proof has expired (now > expiresAt)', async () => {
    const farFuture = new Date(NOW.getTime() + 48 * 60 * 60 * 1000);
    const v = await mod.verifySelectiveDisclosureProof(signedProof(), CARD_ID, farFuture);
    expect(v.isValid).toBe(false);
    expect(v.reason).toBe('Proof has expired');
  });

  it('rejects when signature is tampered (single bit flip)', async () => {
    const proof = signedProof();
    const sigBytes = base64Decode(proof.signature);
    sigBytes[0] = (sigBytes[0] ?? 0) ^ 0x01;
    const v = await mod.verifySelectiveDisclosureProof(
      { ...proof, signature: base64Encode(sigBytes) },
      CARD_ID,
      NOW
    );
    expect(v.isValid).toBe(false);
    expect(v.reason).toBe('Invalid signature');
  });

  it('rejects when the disclosed field set is tampered', async () => {
    // The signature covers the selected-field SET, so adding a field changes
    // the reconstructed canonical bytes and the ECDSA check fails.
    const proof = signedProof();
    const v = await mod.verifySelectiveDisclosureProof(
      { ...proof, disclosedFields: { ...proof.disclosedFields, company: 'Faked Co.' } },
      CARD_ID,
      NOW
    );
    expect(v.isValid).toBe(false);
    expect(v.reason).toBe('Invalid signature');
  });

  it('rejects when signerPublicKey is absent (v2 mandatory)', async () => {
    const v = await mod.verifySelectiveDisclosureProof(
      { ...signedProof(), signerPublicKey: undefined },
      CARD_ID,
      NOW
    );
    expect(v.isValid).toBe(false);
    expect(v.reason).toBe('Missing signerPublicKey (v2 required)');
  });
});

describe('canonical signing bytes', () => {
  it('canonical signing bytes round-trip via _internal helper', () => {
    const bytes = mod._internal.canonicalSigningBytes({
      businessCardId: 'card-id',
      selectedFields: new Set(['name', 'title']),
      recipientId: 'r-1',
      timestamp: new Date(1779712497000),
    });
    expect(new TextDecoder().decode(bytes)).toBe(
      'card-id|name,title|r-1|1779712497'
    );
  });

  it('canonical signing bytes use empty recipient when omitted', () => {
    const bytes = mod._internal.canonicalSigningBytes({
      businessCardId: 'card-id',
      selectedFields: new Set(['name']),
      timestamp: new Date(1779712497000),
    });
    expect(new TextDecoder().decode(bytes)).toBe('card-id|name||1779712497');
  });
});
