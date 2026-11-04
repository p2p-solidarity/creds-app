/**
 * Envelope handler — exercises the receive-side dispatch built on top of
 * `parseEnvelopeFromWire` + `decryptZKPayload`. We round-trip every format
 * the sender produces (plaintext / zkProof / didSigned) so the test doubles
 * as a parity oracle: any divergence between sender + receiver breaks here.
 *
 * Master-key fixture pattern lifted from qrEnvelopeWire.test.ts so the real
 * AES-GCM seal is exercised end-to-end without an Expo runtime.
 */
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';

import type * as SolidarityQrPayloadModule from '../../src/cards/solidarityQrPayload';
import type * as QrEnvelopeModule from '../../src/cards/qrEnvelope';
import type * as EnvelopeHandlerModule from '../../src/scan/envelopeHandler';

import {
  generateP256KeyPair,
  publicKeyToJwk,
  signJwtEs256,
  type BusinessCard,
  type PublicKeyJWK,
  type SharingPreferences,
} from '@solidarity/shared';

const FIXED_MASTER_KEY = new Uint8Array(32).fill(0xa1);

let payloadMod: typeof SolidarityQrPayloadModule;
let envelopeMod: typeof QrEnvelopeModule;
let handlerMod: typeof EnvelopeHandlerModule;

beforeAll(async () => {
  // Process-wide mocks: bun caches mock.module registrations across test
  // files, so any file that doesn't intercept these chains can pollute the
  // module cache for files that run later (specifically: `expo-secure-store`
  // pulls in `react-native/index.js` which uses Flow's `import typeof`,
  // and Bun's parser rejects it).
  await mock.module('@/storage/secureMasterKey', () => ({
    getMasterKey: async () => FIXED_MASTER_KEY,
    resetMasterKeyForTesting: async () => undefined,
    evictMasterKeyCache: () => undefined,
  }));
  await mock.module('@/keychain/signingKey', () => ({
    signRawEs256: async () => {
      throw new Error('test: signing key unavailable in envelopeHandler suite');
    },
    wrapRawSigningInputForSpruce: (p: Uint8Array) => p,
    ensureSigningKey: async () => {
      throw new Error('test: signing key unavailable');
    },
    publicJwk: async () => {
      throw new Error('test: signing key unavailable');
    },
    signJwt: async () => 'signed.jwt.fake',
    didKeyForCurrentIdentity: async () => 'did:key:zTestStub',
    resetSigningKeyForTesting: async () => undefined,
    // T7 conflict surface — mocks stay export-complete (A5.3 lesson: a
    // partial module mock poisons real-import files in the same run).
    hasExistingSigningKey: async () => false,
  }));
  payloadMod = await import('../../src/cards/solidarityQrPayload');
  envelopeMod = await import('../../src/cards/qrEnvelope');
  handlerMod = await import('../../src/scan/envelopeHandler');
});

const NOW = new Date('2027-05-25T12:34:56.789Z');
const SHARE_ID = '11111111-2222-4333-8444-555555555555';
const CREDENTIAL_ID = '22222222-3333-4444-8555-666666666666';
const CARD_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const DID = 'did:key:zTestIssuer';

function makePrefs(): SharingPreferences {
  return {
    publicFields: new Set(['name', 'title', 'company']),
    professionalFields: new Set([
      'name',
      'title',
      'company',
      'email',
      'phone',
    ]),
    personalFields: new Set([
      'name',
      'title',
      'company',
      'email',
      'phone',
      'socialNetworks',
    ]),
    allowForwarding: false,
    expirationDate: undefined,
    useZK: true,
    sharingFormat: 'zkProof',
  };
}

function makeCard(): BusinessCard {
  return {
    id: CARD_ID,
    name: 'Ada Lovelace',
    title: 'Founder',
    company: 'Analytical Engines',
    email: 'ada@example.com',
    phone: '+1-555-0100',
    profileImage: undefined,
    animal: 'dove',
    socialNetworks: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        platform: 'GitHub',
        username: 'ada',
        url: 'https://github.com/ada',
      },
    ],
    skills: [],
    categories: ['computing'],
    sharingPreferences: makePrefs(),
    groupContext: undefined,
    verifiedFields: undefined,
    nameType: 'display_name',
    createdAt: new Date('2026-05-20T00:00:00Z'),
    updatedAt: new Date('2026-05-24T00:00:00Z'),
  };
}

describe('handleScannedPayload — plaintext envelope', () => {
  it('rebuilds a BusinessCard from a plaintext snapshot', async () => {
    const wire = payloadMod.buildSolidarityQrPayload(makeCard(), {
      now: NOW,
      shareId: SHARE_ID,
      sharingLevel: 'professional',
    });
    const outcome = await handlerMod.handleScannedPayload(wire);
    expect(outcome.kind).toBe('card');
    expect(outcome.card?.id).toBe(CARD_ID);
    expect(outcome.card?.name).toBe('Ada Lovelace');
    expect(outcome.card?.title).toBe('Founder');
    expect(outcome.card?.email).toBe('ada@example.com');
    expect(outcome.verificationStatus).toBe('Unverified');
  });

  it('rejects an expired plaintext envelope', async () => {
    const wire = payloadMod.buildSolidarityQrPayload(makeCard(), {
      now: new Date('2020-01-01T00:00:00Z'),
      shareId: SHARE_ID,
      sharingLevel: 'professional',
      expirationDate: new Date('2020-01-02T00:00:00Z'),
    });
    const outcome = await handlerMod.handleScannedPayload(wire);
    expect(outcome.kind).toBe('error');
    expect(outcome.errorMessage).toContain('expired');
  });
});

// The zkProof sender is retired; old envelopes are sealed here through the
// real `encryptJson` (not the literal FIXED_MASTER_KEY) so the ciphertext is
// decryptable by `decryptJson` whichever master-key mock is active across the
// full run (many suites mock getMasterKey).
async function forgeZkEnvelope(sharingPayload: Record<string, unknown>): Promise<string> {
  const { encryptJson } = await import('@/storage/encryptionManager');
  const ciphertext = await encryptJson(sharingPayload);
  return JSON.stringify({
    version: 2,
    format: 'zkProof',
    sharingLevel: 'professional',
    selectedFields: ['name'],
    shareId: SHARE_ID,
    encryptedPayload: ciphertext,
  });
}

function baseSharingPayload(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    businessCard: {
      cardId: CARD_ID,
      name: 'Mallory',
      nameType: 'display_name',
      emails: [],
      phones: [],
      skills: [],
      socialProfiles: [],
      categories: [],
      updatedAt: '2026-05-24T00:00:00Z',
    },
    sharingLevel: 'professional',
    selectedFields: ['name'],
    scope: 'fields:name',
    expirationDate: '2030-01-01T00:00:00Z',
    shareId: SHARE_ID,
    createdAt: '2026-05-24T00:00:00Z',
    format: 'zkProof',
    ...extra,
  };
}

describe('handleScannedPayload — zkProof envelope', () => {
  it('decrypts the encrypted payload back into a BusinessCard', async () => {
    const outcome = await handlerMod.handleScannedPayload(await forgeZkEnvelope(baseSharingPayload({})));
    expect(outcome.kind).toBe('card');
    expect(outcome.card?.id).toBe(CARD_ID);
    expect(outcome.card?.name).toBe('Mallory');
    // No sd/issuer proofs → `Unverified`, not `Verified`.
    expect(outcome.verificationStatus).toBe('Unverified');
  });

  it('returns an error when ciphertext cannot be decrypted', async () => {
    // Forge a zkProof envelope with garbage ciphertext.
    const garbageEnvelope = JSON.stringify({
      version: 2,
      format: 'zkProof',
      sharingLevel: 'professional',
      selectedFields: [],
      shareId: SHARE_ID,
      encryptedPayload: 'AAAAAAAAAAAAAAAAAAAAAAAA',
    });
    const outcome = await handlerMod.handleScannedPayload(garbageEnvelope);
    expect(outcome.kind).toBe('error');
    expect(outcome.errorMessage).toContain('decrypt');
  });
});

describe('handleScannedPayload — didSigned (bare JWT)', () => {
  it('verifies a signature-valid JWT and emits Verified', async () => {
    const { jwt, publicKeyJwk } = signTestVcJwt({
      iss: DID,
      sub: DID,
      cardId: CARD_ID,
      name: 'Ada Lovelace',
    });
    void publicKeyJwk;
    const outcome = await handlerMod.handleScannedPayload(jwt);
    expect(outcome.kind).toBe('card');
    expect(outcome.card?.id).toBe(CARD_ID);
    expect(outcome.card?.name).toBe('Ada Lovelace');
    expect(outcome.verificationStatus).toBe('Verified');
  });

  it('returns Failed when the signature is tampered', async () => {
    const { jwt } = signTestVcJwt({
      iss: DID,
      sub: DID,
      cardId: CARD_ID,
      name: 'Ada Lovelace',
    });
    const parts = jwt.split('.');
    // Replace the signature with a deterministically-different 64-byte
    // string. Any single-char nudge could still be a valid signature for
    // a different curve point pair, so flip an entire segment.
    const tampered = `${parts[0]}.${parts[1]}.${'A'.repeat(86)}`;
    const outcome = await handlerMod.handleScannedPayload(tampered);
    expect(outcome.kind).toBe('card');
    expect(outcome.verificationStatus).toBe('Failed');
  });
});

describe('handleScannedPayload — fast paths', () => {
  it('classifies openid4vp:// as an OIDC request', async () => {
    const url = 'openid4vp://present?client_id=demo&request_uri=https://example.com/r';
    const outcome = await handlerMod.handleScannedPayload(url);
    expect(outcome.kind).toBe('oidc-request');
    expect(outcome.oidcPayload).toBe(url);
  });

  it('returns unknown for random strings', async () => {
    expect((await handlerMod.handleScannedPayload('hello world')).kind).toBe('unknown');
    expect((await handlerMod.handleScannedPayload('')).kind).toBe('unknown');
  });

  it('returns unknown for solidarity:// deep links (legacy handler takes over)', async () => {
    expect(
      (await handlerMod.handleScannedPayload(`solidarity://card/${CARD_ID}`)).kind
    ).toBe('unknown');
  });
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function signTestVcJwt(args: {
  readonly iss: string;
  readonly sub: string;
  readonly cardId: string;
  readonly name: string;
  readonly subscription?: Record<string, unknown>;
}): { readonly jwt: string; readonly publicKeyJwk: PublicKeyJWK } {
  const { privateKey, publicKey } = generateP256KeyPair();
  const jwk = publicKeyToJwk(publicKey);
  const iat = Math.round(NOW.getTime() / 1000);
  const payload: Record<string, unknown> = {
    jti: `urn:uuid:${CREDENTIAL_ID}`,
    iss: args.iss,
    sub: args.sub,
    iat,
    nbf: iat,
    vc: {
      '@context': ['https://www.w3.org/2018/credentials/v1', 'https://schema.org'],
      type: ['VerifiableCredential', 'BusinessCardCredential'],
      credentialSubject: {
        id: args.sub,
        '@type': ['Person', 'BusinessCardSubject'],
        subject_core: {
          name: args.name,
          nameType: 'display_name',
          nameVerificationStatus: 'self_attested',
          businessCardId: args.cardId,
          publicKeyJwk: jwk,
        },
        ...(args.subscription ? { subscription: args.subscription } : {}),
        name: args.name,
        businessCardId: args.cardId,
        publicKeyJwk: jwk,
      },
    },
  };
  const jwt = signJwtEs256({ alg: 'ES256' }, payload, privateKey);
  return { jwt, publicKeyJwk: jwk };
}

// ── issuerProof (Semaphore) on old zkProof envelopes ───────────────────────
//
// The proof is still checked (a broken one is a lie → Failed), but a valid
// one proves membership in SOME group only — an attacker's own included —
// and no group root is recognisable any more, so it never upgrades a card.

describe('handleScannedPayload — zkProof envelope with issuerProof', () => {
  const INNER_PROOF_JSON = JSON.stringify({
    merkle_tree_depth: 16,
    merkle_tree_root: '222',
    nullifier: '111',
    message: 'inner-message',
    scope: 'inner-scope',
    points: [],
  });
  const receivedProofs: { proofJson?: unknown }[] = [];

  function fullProofJson(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      nullifier: '111',
      merkleRoot: '222',
      scope: 'fields:name',
      signal: SHARE_ID,
      proofJson: INNER_PROOF_JSON,
      merkleTreeDepth: 16,
      ...overrides,
    });
  }

  async function scan(extra: Record<string, unknown>): ReturnType<typeof handlerMod.handleScannedPayload> {
    receivedProofs.length = 0;
    return handlerMod.handleScannedPayload(await forgeZkEnvelope(baseSharingPayload(extra)));
  }

  beforeAll(async () => {
    await mock.module('@/zk/groupManager', () => ({
      verifyGroupProof: async (proof: { proofJson?: unknown }) => {
        receivedProofs.push(proof);
        return typeof proof.proofJson === 'string' && proof.proofJson.length > 0;
      },
    }));
  });

  it('hands the full envelope inner proofJson to the verifier; a valid proof stays Unverified', async () => {
    const outcome = await scan({ issuerProof: fullProofJson() });
    expect(outcome.kind).toBe('card');
    expect(outcome.verificationStatus).toBe('Unverified');
    expect(receivedProofs.length).toBe(1);
    expect(receivedProofs[0]?.proofJson).toBe(INNER_PROOF_JSON);
  });

  it('accepts the legacy inner-JSON wire and hands the raw wire string to the verifier', async () => {
    const outcome = await scan({ issuerProof: INNER_PROOF_JSON });
    expect(outcome.verificationStatus).toBe('Unverified');
    expect(receivedProofs[0]?.proofJson).toBe(INNER_PROOF_JSON);
  });

  it('a proof that fails verification is Failed', async () => {
    const outcome = await scan({ issuerProof: fullProofJson({ proofJson: '' }) });
    expect(outcome.verificationStatus).toBe('Failed');
  });

  it('an is_human claim over a valid proof is Unverified, never granted', async () => {
    const outcome = await scan({ proofClaims: ['is_human'], issuerProof: fullProofJson() });
    expect(outcome.verificationStatus).toBe('Unverified');
  });

  it('an is_human claim with NO issuer proof at all is Failed (a lie, not cannot-check)', async () => {
    const outcome = await scan({ proofClaims: ['is_human'] });
    expect(outcome.kind).toBe('card');
    expect(outcome.verificationStatus).toBe('Failed');
  });

  it('evaluates age_over_18 failure before downgrading is_human to Unverified', async () => {
    // is_human over a valid proof (Unverified alone) PLUS age_over_18 with no
    // sd proof (an outright Failed). The unambiguous Failed must win.
    const outcome = await scan({ proofClaims: ['is_human', 'age_over_18'], issuerProof: fullProofJson() });
    expect(outcome.verificationStatus).toBe('Failed');
  });
});

// ── nostr subscription pointer in signed card claims (05-spec §3 v1.1) ─────

describe('handleScannedPayload — nostr subscription pointer', () => {
  const NPUB = 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqql6verd';

  it('surfaces the pointer from a signature-valid JWT, sanitizing relays', async () => {
    const { jwt } = signTestVcJwt({
      iss: DID,
      sub: DID,
      cardId: CARD_ID,
      name: 'Ada Lovelace',
      subscription: {
        nostr: {
          npub: NPUB,
          relays: [
            'wss://relay.damus.io',
            'https://not-wss.example',
            'wss://relay.damus.io',
            'ftp://nope',
            'wss://nos.lol',
          ],
        },
      },
    });
    const outcome = await handlerMod.handleScannedPayload(jwt);
    expect(outcome.kind).toBe('card');
    expect(outcome.verificationStatus).toBe('Verified');
    expect(outcome.nostrPointer).toEqual({
      npub: NPUB,
      relays: ['wss://relay.damus.io', 'wss://nos.lol'],
    });
  });

  it('never surfaces a pointer from an unverifiable JWT', async () => {
    // Build a signed JWT, then break the signature by swapping one payload
    // byte-equivalent: easiest honest path — sign, then tamper the sub in a
    // re-encoded copy is complex; instead craft a JWT with NO embedded key
    // (extractPublicKeyJwk finds nothing → Unverified).
    const { jwt } = signTestVcJwt({
      iss: DID,
      sub: DID,
      cardId: CARD_ID,
      name: 'Ada Lovelace',
      subscription: { nostr: { npub: NPUB, relays: [] } },
    });
    // Strip the embedded jwk by rebuilding the payload without it.
    const [h, p] = jwt.split('.');
    const decoded = JSON.parse(Buffer.from(p!, 'base64url').toString()) as Record<string, unknown>;
    const vc = decoded['vc'] as { credentialSubject: Record<string, unknown> };
    delete vc.credentialSubject['publicKeyJwk'];
    delete (vc.credentialSubject['subject_core'] as Record<string, unknown>)['publicKeyJwk'];
    const tampered = `${h}.${Buffer.from(JSON.stringify(decoded)).toString('base64url')}.sig`;
    const outcome = await handlerMod.handleScannedPayload(tampered);
    expect(outcome.kind).toBe('card');
    expect(outcome.verificationStatus).toBe('Unverified');
    expect(outcome.nostrPointer).toBeUndefined();
  });

  it('rejects a malformed npub in the claim', async () => {
    const { jwt } = signTestVcJwt({
      iss: DID,
      sub: DID,
      cardId: CARD_ID,
      name: 'Ada Lovelace',
      subscription: { nostr: { npub: 'npub1UPPERCASE-INVALID', relays: [] } },
    });
    const outcome = await handlerMod.handleScannedPayload(jwt);
    expect(outcome.verificationStatus).toBe('Verified');
    expect(outcome.nostrPointer).toBeUndefined();
  });
});
