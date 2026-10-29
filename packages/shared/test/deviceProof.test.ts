/**
 * Device-attestation verifiers (docs/ref/10 §3.11) — tested at five seams with
 * real public vectors (`fixtures/deviceproof/README.md`) and tampered copies.
 *
 * Failure modes, listed before the code:
 *  RSA       wrong/tampered digest, wrong hash algorithm, signature length ≠ modulus,
 *            signature ≥ modulus, Bleichenbacher e=3 forgery (short padding + trailing garbage).
 *  chain     untrusted root, a link that does not verify, issuer that is not a CA, name
 *            mismatch, outside the validity window at the proof's time, malformed DER, empty.
 *  AppAttest wrong app ID, wrong challenge (nonce), key id ≠ credential key, development key
 *            where production is required, chain not to Apple's root, tampered authData;
 *            assertion: tampered client data, other key, other app.
 *  Android   wrong challenge, package or signing digest, software-level key, unlocked or
 *            unverified boot, chain not to Google's roots, revoked certificate, KeyDescription
 *            not on the leaf (attacker-extended chain), malformed KeyDescription.
 *  witness   bad nostr signature, device key bound to another npub, statement not signed by
 *            the device key, tampered statement, unsupported version.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { sha256 } from '@noble/hashes/sha2.js';

import { base64Decode } from '../src/crypto/base64';
import { cborDecode, cborEncode } from '../src/qr/cbor';
import {
  APPLE_APP_ATTEST_ROOT_B64,
  GOOGLE_EC_ROOT_B64,
  GOOGLE_RSA_ROOT_B64,
  WITNESS_EVENT_KIND,
  buildWitnessEvent,
  rsaPkcs1v15Verify,
  verifyAndroidKeyAttestation,
  verifyAppAttestAssertion,
  verifyAppAttestation,
  verifyCertChain,
  verifyWitness,
  type DeviceProofTrust,
  type WitnessStatement,
} from '../src/deviceproof';
import { signNostrEventWithScalar, type NostrEvent } from '../src/nostr/event';
import { hexToNpub } from '../src/nostr/npub';
import { schnorr } from '@noble/curves/secp256k1.js';

const hex = (h: string): Uint8Array => Uint8Array.from(h.match(/../gu) ?? [], (b) => parseInt(b, 16));
const big = (h: string): bigint => BigInt(`0x${h}`);

// Generated with openssl (2048-bit keys, `openssl dgst -sha256 -sign`) over "creds device proof".
const N65537 = big('bc0ef0df1f23e24436286f400b945d142eae480225b8d33711e76e2a0cf23824d749f7988f1088a0b75c5eece370953b3f0ffdb8be19c6a9ffb7c68e53cbb8f548c33023f7e4db834627745b98000392700f230905d239fabfd4ec61c11d5fcd453b1e3467ffdf1e467dda731af78f07c5362ba74710acd9c497fe246b6684894cc03586f2e0ecf31feaf122043fc6ce762cd388c38dd4fda9d5c728de495501610e3e6d48327bfa239e56f36caaa17124962865434a338992513a1fb76ca6863348d9a6340b3344edf29bb3ee08db7d5a33bbe900b18dbe6481d7591a99d3ebfd26f46763c7f335ea1fc1ddb51b8f66416e8103577d0c9f0983aa9f7d64c6d9');
const SIG65537 = hex('a836d92830227342129dea6337d061b44a7787ae1844b8b4c80d79a6d894f8262e91a703bad12698a4e647db4fc40a78034bdc5ec85113b8f64fd7da267e7a7115fad9eed58b3f34830b6b67b1bb11809c4ac20799a0a7e79384ff3de0d9aef6bdafd00d3b97d987cdcf535f9d7834ea6013dbd85bec19b4fc874eb2743c2bb1fba3298cfd2f9357432b42e10858e18d166b5675c4978bde5cdd5e2df1f7ee606d335c3ce98ab4c50db851b421d8e8558cff5d07b5c1d45acf519eb1f6cf9465ae7d203182da5108d1085ee2a515bc0f78d6594e259cfc239e261add6dc80feaf13fdbadaa6f1a9cfcde14489d800ab080a5703c5deee239d06383b7f70da08f');
const N3 = big('b2ac080108b743b048c5d9a522834b29df95e018d0a721321fddf4bb20cb1f691303b0537cab0ab9d27a359e62e101cb82868296c72973a736f6d1a4af2f61cb64a65a5834f498c5523b8161f437addcb19f39299aa259d914de75473620eeeb307013cb57429dbb9ad996c2d8374b1517da757735795dec85d9c838a49b67b36115b7bcf315e6c1a5c9feb1e4db84471c57d5020c1d5d9e3ef0a958eac3bbd956598e8d40f21d74ccbbe692ac0a340e3a2a73dddad021071cb238a2f60e6d3210a563257ffa51b181e3de63cc3fbc12e290c3876fcb06ec9d9a8d91a7afd186340c9bc205b30b92195ce40cfc5dd470e690eb176f4a13f8c35e86cdc6b183ed');
const SIG3 = hex('a549e6ffee06aee51f349b416bcadfdd18b3714280388ee8de9156403f42cf55beb320bdf0f6f92c9d76d3b40a6114a519e01965cdd63403a88557daa6ba4bab520a7ee0401a6d4c1022f16201f8eed2a096e2d45ca570c356b08774b058cb9561c359859564de145e86b93811a58bbad459f806dcd80a14354f9d8e8f58eb03f0794f6e083b4fc33bf4690de66803ecc7dcc7bba8e69dad4f40c4eb6e785dd54c5564150e678c352f1c5471deb791b7d4db2beee59cd4c40fe9a885a7e18c78d4a494f4768e30bece32f91eb59fe4de839ca3063c18922ee47bfe3ca4ec69c30b7d9f0e8dfbac951aaf98f75987e457ae86bb12f0d39814c2b9e5364d4b281d');
const DIGEST = hex('c2a58fbb0db3a916ebb620979c87dc3c22a98ec105987cc9e7bfb92efd432561');

function toBytes(n: bigint, len: number): Uint8Array {
  const out = new Uint8Array(len);
  for (let i = len - 1; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

/** Smallest s with s³ ≥ x (Newton on bigint). */
function ceilCbrt(x: bigint): bigint {
  let s = 1n << BigInt(Math.ceil(x.toString(2).length / 3));
  for (;;) {
    const next = (2n * s + x / (s * s)) / 3n;
    if (next >= s) break;
    s = next;
  }
  while (s * s * s < x) s += 1n;
  return s;
}

describe('rsaPkcs1v15Verify', () => {
  test('accepts an openssl SHA-256 signature', () => {
    expect(rsaPkcs1v15Verify({ n: N65537, e: 65537n }, 'sha256', DIGEST, SIG65537)).toBe(true);
    expect(rsaPkcs1v15Verify({ n: N3, e: 3n }, 'sha256', DIGEST, SIG3)).toBe(true);
  });

  test('rejects another digest or a claimed hash it was not made with', () => {
    expect(rsaPkcs1v15Verify({ n: N65537, e: 65537n }, 'sha256', sha256(DIGEST), SIG65537)).toBe(false);
    expect(rsaPkcs1v15Verify({ n: N65537, e: 65537n }, 'sha384', DIGEST, SIG65537)).toBe(false);
  });

  test('rejects a signature of the wrong length or not below the modulus', () => {
    expect(rsaPkcs1v15Verify({ n: N65537, e: 65537n }, 'sha256', DIGEST, SIG65537.slice(1))).toBe(false);
    expect(rsaPkcs1v15Verify({ n: N65537, e: 65537n }, 'sha256', DIGEST, toBytes(N65537, 256))).toBe(false);
  });

  test('rejects a Bleichenbacher e=3 forgery (short padding, garbage after the digest)', () => {
    const digestInfo = hex('3031300d060960864801650304020105000420');
    const prefix = new Uint8Array([0x00, 0x01, 0xff, 0x00, ...digestInfo, ...DIGEST]);
    const garbageBits = BigInt((256 - prefix.length) * 8);
    let target = 0n;
    for (const b of prefix) target = (target << 8n) | BigInt(b);
    const forged = ceilCbrt(target << garbageBits);
    // The forgery really does carry the valid-looking prefix — only a strict check catches it.
    expect(toBytes(forged ** 3n, 256).slice(0, prefix.length)).toEqual(prefix);
    expect(rsaPkcs1v15Verify({ n: N3, e: 3n }, 'sha256', DIGEST, toBytes(forged, 256))).toBe(false);
  });
});

const FIXTURES = join(import.meta.dir, 'fixtures', 'deviceproof');
const pemChain = (name: string): Uint8Array[] =>
  [...readFileSync(join(FIXTURES, 'android', `${name}.pem`), 'utf8').matchAll(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/gu)].map(
    (m) => base64Decode((m[1] ?? '').replace(/\s/gu, '')),
  );
const GOOGLE_ROOTS = [GOOGLE_RSA_ROOT_B64, GOOGLE_EC_ROOT_B64].map(base64Decode);
const APPLE_ROOTS = [base64Decode(APPLE_APP_ATTEST_ROOT_B64)];
const appAttestFixture = (env: 'development' | 'production') =>
  JSON.parse(readFileSync(join(FIXTURES, 'appattest', `attestation-${env}.json`), 'utf8')) as { attestation: string; keyId: string; challenge: string };
const appleX5c = (env: 'development' | 'production'): Uint8Array[] => {
  const obj = cborDecode(base64Decode(appAttestFixture(env).attestation)) as Map<string, unknown>;
  return (obj.get('attStmt') as Map<string, unknown>).get('x5c') as Uint8Array[];
};
// Inside each real chain's validity window (see the fixture README).
const AT_CAIMAN = Date.UTC(2025, 8, 28);
const AT_TEGU = Date.UTC(2026, 1, 25);
const AT_APPLE = Date.UTC(2024, 5, 1);

describe('verifyCertChain', () => {
  test('accepts Google factory (RSA), RKP and 2025-root chains, and Apple App Attest chains', () => {
    expect(verifyCertChain(pemChain('blueline_sdk28_TEE_RSA_NONE'), { roots: GOOGLE_ROOTS, at: null }).ok).toBe(true);
    expect(verifyCertChain(pemChain('caiman_sdk36_TEE_EC_RKP'), { roots: GOOGLE_ROOTS, at: AT_CAIMAN }).ok).toBe(true);
    expect(verifyCertChain(pemChain('tegu_sdk36_TEE_EC_2026_ROOT'), { roots: GOOGLE_ROOTS, at: AT_TEGU }).ok).toBe(true);
    expect(verifyCertChain(appleX5c('production'), { roots: APPLE_ROOTS, at: AT_APPLE }).ok).toBe(true);
  });

  test('rejects a chain that ends at a root nobody pinned', () => {
    expect(verifyCertChain(pemChain('caiman_sdk36_TEE_EC_RKP'), { roots: APPLE_ROOTS, at: AT_CAIMAN }).ok).toBe(false);
    expect(verifyCertChain(appleX5c('production'), { roots: GOOGLE_ROOTS, at: AT_APPLE }).ok).toBe(false);
  });

  test('rejects a link whose issuer did not sign it', () => {
    const chain = pemChain('caiman_sdk36_TEE_EC_RKP');
    chain[1] = pemChain('tegu_sdk36_TEE_EC_2026_ROOT')[1] as Uint8Array;
    expect(verifyCertChain(chain, { roots: GOOGLE_ROOTS, at: AT_CAIMAN }).ok).toBe(false);
  });

  test('rejects a chain checked outside its validity window', () => {
    expect(verifyCertChain(pemChain('caiman_sdk36_TEE_EC_RKP'), { roots: GOOGLE_ROOTS, at: Date.UTC(2025, 9, 10) }).ok).toBe(false);
    expect(verifyCertChain(appleX5c('production'), { roots: APPLE_ROOTS, at: Date.UTC(2025, 5, 1) }).ok).toBe(false);
  });

  test('rejects malformed DER and an empty chain', () => {
    const chain = pemChain('caiman_sdk36_TEE_EC_RKP');
    chain[0] = (chain[0] as Uint8Array).slice(0, 100);
    expect(verifyCertChain(chain, { roots: GOOGLE_ROOTS, at: AT_CAIMAN }).ok).toBe(false);
    expect(verifyCertChain([], { roots: GOOGLE_ROOTS, at: AT_CAIMAN }).ok).toBe(false);
  });
});

describe('verifyAppAttestation', () => {
  const APP_ID = 'V8H6LQ9448.io.uebelacker.AppAttestExample';
  const input = (env: 'development' | 'production') => {
    const f = appAttestFixture(env);
    return {
      attestationObject: base64Decode(f.attestation),
      keyId: base64Decode(f.keyId),
      clientDataHash: sha256(base64Decode(f.challenge)),
      appId: APP_ID,
      environment: env,
      roots: APPLE_ROOTS,
      at: AT_APPLE,
    };
  };

  test('accepts a real attestation and returns the key whose hash is the key id', () => {
    for (const env of ['production', 'development'] as const) {
      const result = verifyAppAttestation(input(env));
      expect(result.ok).toBe(true);
      if (result.ok) expect(sha256(result.value.publicKey)).toEqual(input(env).keyId);
    }
  });

  test('rejects a development key where production is required', () => {
    expect(verifyAppAttestation({ ...input('development'), environment: 'production' }).ok).toBe(false);
  });

  test('rejects another app, another challenge or another key id', () => {
    expect(verifyAppAttestation({ ...input('production'), appId: 'V8H6LQ9448.io.other.App' }).ok).toBe(false);
    expect(verifyAppAttestation({ ...input('production'), clientDataHash: sha256(new Uint8Array([1])) }).ok).toBe(false);
    expect(verifyAppAttestation({ ...input('production'), keyId: sha256(new Uint8Array([2])) }).ok).toBe(false);
  });

  test('rejects tampered authenticator data and a chain to a root nobody pinned', () => {
    const obj = cborDecode(input('production').attestationObject) as Map<string, unknown>;
    const authData = (obj.get('authData') as Uint8Array).slice();
    authData[36] = 1; // counter must be 0
    obj.set('authData', authData);
    expect(verifyAppAttestation({ ...input('production'), attestationObject: cborEncode(obj) }).ok).toBe(false);
    expect(verifyAppAttestation({ ...input('production'), roots: GOOGLE_ROOTS }).ok).toBe(false);
  });
});

describe('verifyAppAttestAssertion', () => {
  // From node-app-attest test/verifyAssertion.test.js (same app).
  const ASSERTION = base64Decode('omlzaWduYXR1cmVYRzBFAiBB8BGAwkmFCg1M5J0mOYEun0SUN1/lse79/7ypG9WiMQIhAIHvqj7eg59B1PMFX1CN4GMGlsgfFtdL30pHCf7G/dNRcWF1dGhlbnRpY2F0b3JEYXRhWCXKPdw7T3iujcFZbHVrHX0mDSMrNms5PzEbrFbQPRA6rEAAAAAB');
  const SPKI = base64Decode('MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEg69t2YzgcPTLUx8Zgu+rbcikeaEL8Ppb+HG0QTIulz8YUB9tgv1pDRruWk87nZC3our56pzIWaqXEbaWyamdzA==');
  const PUBLIC_KEY = SPKI.slice(SPKI.length - 65);
  const PAYLOAD = new TextEncoder().encode('{"subject":"Lorem ipsum","message":"Lorem ipsum dolor sit amet, consectetur adipiscing elit."}');
  const APP_ID = 'V8H6LQ9448.io.uebelacker.AppAttestExample';

  test('accepts a real assertion over its client data', () => {
    const result = verifyAppAttestAssertion({ assertion: ASSERTION, clientData: PAYLOAD, publicKey: PUBLIC_KEY, appId: APP_ID });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.counter).toBe(1);
  });

  test('rejects tampered client data, another key or another app', () => {
    const other = PAYLOAD.slice();
    other[2] = 0x53;
    expect(verifyAppAttestAssertion({ assertion: ASSERTION, clientData: other, publicKey: PUBLIC_KEY, appId: APP_ID }).ok).toBe(false);
    const otherKey = PUBLIC_KEY.slice();
    otherKey[10] ^= 1;
    expect(verifyAppAttestAssertion({ assertion: ASSERTION, clientData: PAYLOAD, publicKey: otherKey, appId: APP_ID }).ok).toBe(false);
    expect(verifyAppAttestAssertion({ assertion: ASSERTION, clientData: PAYLOAD, publicKey: PUBLIC_KEY, appId: 'V8H6LQ9448.io.other.App' }).ok).toBe(false);
  });
});

describe('verifyAndroidKeyAttestation', () => {
  interface Expected { attestationChallenge: string; softwareEnforced: { attestationApplicationId: { packages: { name: string }[]; signatures: string[] } } }
  const expected = (name: string) => JSON.parse(readFileSync(join(FIXTURES, 'android', `${name}.json`), 'utf8')) as Expected;
  // Each input's expected values come from Google's own parse of that chain (the .json beside it).
  const input = (name: string, at: number) => {
    const e = expected(name);
    return {
      chain: pemChain(name),
      challenge: base64Decode(e.attestationChallenge),
      packageName: e.softwareEnforced.attestationApplicationId.packages[0]?.name ?? '',
      signatureDigests: e.softwareEnforced.attestationApplicationId.signatures.map(base64Decode),
      roots: GOOGLE_ROOTS,
      at,
    };
  };
  const CAIMAN = 'caiman_sdk36_TEE_EC_RKP';

  test('accepts a locked, verified-boot device on an RKP chain and on the 2025 root', () => {
    const result = verifyAndroidKeyAttestation(input(CAIMAN, AT_CAIMAN));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.securityLevel).toBe('TrustedEnvironment');
    expect(verifyAndroidKeyAttestation(input('tegu_sdk36_TEE_EC_2026_ROOT', AT_TEGU)).ok).toBe(true);
  });

  test('rejects an unlocked or unverified-boot device', () => {
    const result = verifyAndroidKeyAttestation(input('blueline_sdk28_TEE_RSA_NONE', AT_CAIMAN));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('boot');
  });

  test('rejects another challenge, another package or another signing key', () => {
    expect(verifyAndroidKeyAttestation({ ...input(CAIMAN, AT_CAIMAN), challenge: new Uint8Array([1, 2, 3]) }).ok).toBe(false);
    expect(verifyAndroidKeyAttestation({ ...input(CAIMAN, AT_CAIMAN), packageName: 'gg.solidarity.app' }).ok).toBe(false);
    expect(verifyAndroidKeyAttestation({ ...input(CAIMAN, AT_CAIMAN), signatureDigests: [sha256(new Uint8Array([9]))] }).ok).toBe(false);
  });

  test('rejects a chain off Google’s roots, a revoked certificate, or an expired RKP certificate', () => {
    expect(verifyAndroidKeyAttestation({ ...input(CAIMAN, AT_CAIMAN), roots: APPLE_ROOTS }).ok).toBe(false);
    expect(verifyAndroidKeyAttestation({ ...input(CAIMAN, AT_CAIMAN), revokedSerials: new Set(['ed74866372b0791cf1478b39fad0f755593ad3']) }).ok).toBe(false);
    expect(verifyAndroidKeyAttestation(input(CAIMAN, Date.UTC(2025, 9, 10))).ok).toBe(false);
  });

  test('rejects a chain whose leaf carries no KeyDescription', () => {
    expect(verifyAndroidKeyAttestation({ ...input(CAIMAN, AT_CAIMAN), chain: pemChain(CAIMAN).slice(1) }).ok).toBe(false);
  });

  test('rejects Google’s malformed root-of-trust sample on its KeyDescription (the chain itself is valid)', () => {
    const result = verifyAndroidKeyAttestation({ ...input(CAIMAN, AT_CAIMAN), chain: pemChain('malformed_rot_device_locked') });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('KeyDescription');
  });

  test('rejects Google’s out-of-order-tags sample (edited without re-signing: openssl rejects its leaf too)', () => {
    expect(verifyAndroidKeyAttestation({ ...input(CAIMAN, AT_CAIMAN), chain: pemChain('tags_not_in_ascending_order') }).ok).toBe(false);
  });
});

describe('verifyWitness', () => {
  // The positive path needs a statement signed by a real device key; it is recorded from a
  // phone in phase 2 (docs/ref/10 §3.11) and added here then. These cover every refusal.
  const WITNESS_KEY = sha256(new TextEncoder().encode('witness test key'));
  const SUBJECT_KEY = sha256(new TextEncoder().encode('subject test key'));
  const NOTARY_KEY = sha256(new TextEncoder().encode('notary test key'));
  const npubOf = (scalar: Uint8Array): string => {
    const r = hexToNpub(Buffer.from(schnorr.getPublicKey(scalar)).toString('hex'));
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };
  const trust: DeviceProofTrust = {
    appleAppId: 'V8H6LQ9448.io.uebelacker.AppAttestExample',
    appleEnvironment: 'production',
    appleRoots: APPLE_ROOTS,
    androidPackage: 'com.google.android.attestation',
    androidSignatureDigests: [base64Decode('EDk47kU35Z6O55L2VFBPuDRvxrNG0LvEQV/DOfz8jsE=')],
    googleRoots: GOOGLE_ROOTS,
    notaryPubkeys: [Buffer.from(schnorr.getPublicKey(NOTARY_KEY)).toString('hex')],
  };
  const statement = (over: Partial<WitnessStatement> = {}): WitnessStatement => ({
    v: 1,
    claim: 'x:@alice',
    name: 'alice',
    subject: npubOf(SUBJECT_KEY),
    witness: npubOf(WITNESS_KEY),
    observedAt: Math.floor(AT_APPLE / 1000),
    ...over,
  });
  const ios = appAttestFixture('production');
  const iosDevice = { platform: 'ios' as const, attestation: ios.attestation, keyId: ios.keyId, assertion: 'omlzaWduYXR1cmVYRzBFAiBB8BGAwkmFCg1M5J0mOYEun0SUN1/lse79/7ypG9WiMQIhAIHvqj7eg59B1PMFX1CN4GMGlsgfFtdL30pHCf7G/dNRcWF1dGhlbnRpY2F0b3JEYXRhWCXKPdw7T3iujcFZbHVrHX0mDSMrNms5PzEbrFbQPRA6rEAAAAAB' };
  const signed = (st: WitnessStatement, scalar = WITNESS_KEY, device: Parameters<typeof buildWitnessEvent>[1] = iosDevice): NostrEvent => {
    const r = signNostrEventWithScalar(buildWitnessEvent(st, device), scalar, st.observedAt);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };

  test('a notary witness counts only from the pinned notary key', () => {
    const fromNotary = signed(statement({ witness: npubOf(NOTARY_KEY) }), NOTARY_KEY, { platform: 'notary' });
    const verified = verifyWitness(fromNotary, trust);
    expect(verified.ok && verified.value.platform).toBe('notary');
    expect(verifyWitness(signed(statement(), WITNESS_KEY, { platform: 'notary' }), trust).ok).toBe(false);
  });

  test('witness events are NIP-78 app data', () => {
    expect(buildWitnessEvent(statement(), iosDevice).kind).toBe(WITNESS_EVENT_KIND);
  });

  test('rejects a tampered event (nostr signature)', () => {
    const event = signed(statement());
    expect(verifyWitness({ ...event, content: event.content.replace('alice', 'mallory') }, trust).ok).toBe(false);
  });

  test('rejects a statement whose witness is not the event author', () => {
    const result = verifyWitness(signed(statement(), SUBJECT_KEY), trust);
    expect(result.ok).toBe(false);
  });

  test('rejects an unsupported version, a malformed claim or a d tag for another claim', () => {
    expect(verifyWitness(signed(statement({ v: 2 as 1 })), trust).ok).toBe(false);
    expect(verifyWitness(signed(statement({ claim: 'myspace:@alice' })), trust).ok).toBe(false);
    const event = signed(statement());
    const retagged = signNostrEventWithScalar({ kind: event.kind, content: event.content, tags: [['d', 'creds.witness:x:@bob']], created_at: event.created_at }, WITNESS_KEY);
    if (!retagged.ok) throw new Error(retagged.error);
    expect(verifyWitness(retagged.value, trust).ok).toBe(false);
  });

  test('rejects a device key attested for another npub (iOS and Android)', () => {
    const iosResult = verifyWitness(signed(statement()), trust);
    expect(iosResult.ok).toBe(false);
    if (!iosResult.ok) expect(iosResult.error).toContain('nonce');
    const android = { platform: 'android' as const, chain: pemChain('caiman_sdk36_TEE_EC_RKP').map((c) => Buffer.from(c).toString('base64')), signature: 'MEQCIA==' };
    const androidResult = verifyWitness(signed(statement({ observedAt: Math.floor(AT_CAIMAN / 1000) }), WITNESS_KEY, android), trust);
    expect(androidResult.ok).toBe(false);
    if (!androidResult.ok) expect(androidResult.error).toContain('challenge');
  });
});
