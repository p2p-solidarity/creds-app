import { describe, expect, test } from 'bun:test';
import { p256 } from '@noble/curves/nist.js';

import type { Signer } from '../src/jws';
import { didKeyFromPublicKey, generateP256KeyPair } from '../src/identity';
import { hexToNpub } from '../src/nostr/npub';
import {
  bioCarriesMarker,
  checkEvidenceFacts,
  signEvidence,
  signNotaryCert,
  verifyNotaryBundle,
  type EvidencePayload,
} from '../src/zktls';

function key() {
  const pair = generateP256KeyPair();
  const signer: Signer = async (digest) => p256.sign(digest, pair.privateKey, { prehash: false });
  return { did: didKeyFromPublicKey(pair.publicKey), signer };
}

const root = key();
const monthly = key();
const npub = hexToNpub('11'.repeat(32));
if (!npub.ok) throw new Error(npub.error);
const NBF = 1_800_000_000;
const EXP = NBF + 31 * 86_400;

const xBio: EvidencePayload = {
  typ: 'creds.zktls.evidence/v1',
  platform: 'x',
  handle: 'alice',
  server: 'x.com',
  request: 'GET /alice HTTP/1.1',
  revealed: '<meta name="description" content="builder · https://t.co/AbC123',
  npub: npub.value,
  iat: NBF + 100,
  tlsn: '0.1.0-alpha.15',
};

async function bundle(
  payload: EvidencePayload = xBio,
  opts: { certRoot?: ReturnType<typeof key>; certKey?: ReturnType<typeof key>; signKey?: ReturnType<typeof key> } = {},
) {
  const certRoot = opts.certRoot ?? root;
  const certKey = opts.certKey ?? monthly;
  const signKey = opts.signKey ?? monthly;
  const cert = await signNotaryCert({ keyDid: certKey.did, nbf: NBF, exp: EXP }, certRoot.did, certRoot.signer);
  const evidence = await signEvidence(payload, signKey.did, signKey.signer);
  return { cert, evidence };
}

const roots = [root.did];

describe('verifyNotaryBundle', () => {
  test('accepts evidence signed by a root-certified monthly key', async () => {
    const result = verifyNotaryBundle(await bundle(), { roots });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.platform).toBe('x');
    expect(result.value.handle).toBe('alice');
    expect(result.value.notaryKey).toBe(monthly.did);
    expect(result.value.revealedValue).toBe('builder · https://t.co/AbC123');
  });

  test('rejects a cert from a root that is not trusted', async () => {
    const stranger = key();
    expect(verifyNotaryBundle(await bundle(xBio, { certRoot: stranger }), { roots }).ok).toBe(false);
  });

  test('rejects evidence signed by a key other than the certified one', async () => {
    expect(verifyNotaryBundle(await bundle(xBio, { signKey: key() }), { roots }).ok).toBe(false);
  });

  test('rejects evidence dated outside the monthly key window', async () => {
    const early = await bundle({ ...xBio, iat: NBF - 1 });
    const late = await bundle({ ...xBio, iat: EXP + 1 });
    expect(verifyNotaryBundle(early, { roots }).ok).toBe(false);
    expect(verifyNotaryBundle(late, { roots }).ok).toBe(false);
  });

  test('rejects evidence from a revoked monthly key', async () => {
    const result = verifyNotaryBundle(await bundle(), { roots, revoked: new Set([monthly.did]) });
    expect(result.ok).toBe(false);
  });

  test('rejects a cert presented in place of evidence', async () => {
    const { cert } = await bundle();
    expect(verifyNotaryBundle({ cert, evidence: cert }, { roots }).ok).toBe(false);
  });

  test('rejects a server that is not the platform host', async () => {
    expect(verifyNotaryBundle(await bundle({ ...xBio, server: 'evil.example' }), { roots }).ok).toBe(false);
  });

  test('rejects a request for a different handle than claimed', async () => {
    expect(verifyNotaryBundle(await bundle({ ...xBio, request: 'GET /bob HTTP/1.1' }), { roots }).ok).toBe(false);
  });

  test('rejects revealed bytes not anchored on the owner-controlled field', async () => {
    const unanchored = await bundle({ ...xBio, revealed: 'creds.id/@alice' });
    const overrun = await bundle({ ...xBio, revealed: '<meta name="description" content="x"/><meta content="creds.id/@alice' });
    expect(verifyNotaryBundle(unanchored, { roots }).ok).toBe(false);
    expect(verifyNotaryBundle(overrun, { roots }).ok).toBe(false);
  });

  test('rejects evidence bound to a malformed npub', async () => {
    expect(verifyNotaryBundle(await bundle({ ...xBio, npub: 'npub1qqqq' }), { roots }).ok).toBe(false);
  });

  test('rejects a handle outside the platform pattern', async () => {
    const result = await bundle({ ...xBio, handle: '../admin', request: 'GET /../admin HTTP/1.1' });
    expect(verifyNotaryBundle(result, { roots }).ok).toBe(false);
  });
});

describe('checkEvidenceFacts', () => {
  test('anchors GitHub on the profile link, not README links', () => {
    const base = { platform: 'github' as const, handle: 'alice', server: 'github.com', request: 'GET /alice HTTP/1.1' };
    expect(checkEvidenceFacts({ ...base, revealed: 'rel="nofollow me" class="Link--primary wb-break-all" href="https://creds.id/@alice' }).ok).toBe(true);
    expect(checkEvidenceFacts({ ...base, revealed: 'href="https://creds.id/@alice' }).ok).toBe(false);
  });

  test('a website reveals only the marker itself', () => {
    const base = { platform: 'website' as const, handle: 'alice.dev', server: 'alice.dev', request: 'GET / HTTP/1.1' };
    expect(checkEvidenceFacts({ ...base, revealed: 'creds.id/@alice' }).ok).toBe(true);
    expect(checkEvidenceFacts({ ...base, revealed: 'anything else' }).ok).toBe(false);
  });

  test('rejects a website host that is a private or local address', () => {
    for (const host of ['localhost', '127.0.0.1', '10.0.0.8', '192.168.1.2', 'x.com']) {
      expect(checkEvidenceFacts({ platform: 'website', handle: host, server: host, request: 'GET / HTTP/1.1', revealed: 'creds.id/@alice' }).ok).toBe(false);
    }
  });
});

describe('checkEvidenceFacts — X profile payload', () => {
  const base = { platform: 'x-profile' as const, handle: 'alice', server: 'x.com', request: 'GET /alice HTTP/1.1' };
  const payload = (screenName = 'alice') =>
    JSON.stringify(JSON.stringify({ data: { user_result_by_screen_name: { result: { core: { screen_name: screenName }, profile_bio: { entities: {} } } } } })).slice(1, -1);

  test('accepts the whole embedded payload of the claimed account', () => {
    expect(checkEvidenceFacts({ ...base, revealed: payload() }).ok).toBe(true);
  });

  test('rejects bytes that do not start at the payload', () => {
    expect(checkEvidenceFacts({ ...base, revealed: `x${payload()}` }).ok).toBe(false);
  });

  test('rejects a range that runs past the end of the JS string', () => {
    expect(checkEvidenceFacts({ ...base, revealed: `${payload()}"},$R[2]={` }).ok).toBe(false);
  });

  test('rejects a truncated payload, an unknown escape or trailing bytes', () => {
    const p = payload();
    expect(checkEvidenceFacts({ ...base, revealed: p.slice(0, -4) }).ok).toBe(false);
    expect(checkEvidenceFacts({ ...base, revealed: p.replace('alice', 'ali\\qce') }).ok).toBe(false);
    expect(checkEvidenceFacts({ ...base, revealed: `${p}1` }).ok).toBe(false);
  });

  test('rejects a payload for another screen name', () => {
    expect(checkEvidenceFacts({ ...base, revealed: payload('mallory') }).ok).toBe(false);
  });

  test('reads seroval-style \\x escapes', () => {
    const p = payload().replace('\\"core', '\\"bio\\":\\"\\x3Cb\\x3E\\",\\"core');
    expect(checkEvidenceFacts({ ...base, revealed: p }).ok).toBe(true);
  });
});

describe('bioCarriesMarker', () => {
  test('matches creds.id/@name only on a name boundary', () => {
    expect(bioCarriesMarker('find me at creds.id/@alice.', 'alice')).toBe(true);
    expect(bioCarriesMarker('https://creds.id/@alice', 'alice')).toBe(true);
    expect(bioCarriesMarker('creds.id/@alicex', 'alice')).toBe(false);
    expect(bioCarriesMarker('notcreds.id/@alice', 'alice')).toBe(false);
  });
});
