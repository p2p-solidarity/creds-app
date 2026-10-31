/**
 * Pro license (docs/ref/09). Failure modes, each must NOT verify:
 *   - signed by a key that is not pinned (anyone can mint a did:key)
 *   - expired, not yet valid, or a lifetime past 7 days
 *   - issued to another did
 *   - payload or signature tampered
 */
import { describe, expect, test } from 'bun:test';
import { p256 } from '@noble/curves/nist.js';

import { didKeyFromPublicKey, generateP256KeyPair } from '../src/identity';
import { signCompact } from '../src/jws';
import { LICENSE_TYP, licenseExpiry, verifyProLicense } from '../src/pro';

function key() {
  const pair = generateP256KeyPair();
  return {
    did: didKeyFromPublicKey(pair.publicKey),
    sign: async (d: Uint8Array) => p256.sign(d, pair.privateKey, { prehash: false }),
  };
}
const issuer = key();
const stranger = key();
const buyer = key();
const NOW = 1_800_000_000;
const mint = (k = issuer, over: Record<string, unknown> = {}) =>
  signCompact({ typ: LICENSE_TYP, sub: buyer.did, product: 'creds.pro.monthly', iat: NOW, exp: NOW + 86_400, ...over }, k.did, k.sign);
const opts = { issuers: [issuer.did], nowSeconds: NOW + 60 };

describe('verifyProLicense', () => {
  test('a pinned, current license for the buyer verifies', async () => {
    const r = verifyProLicense(await mint(), { ...opts, sub: buyer.did });
    expect(r.ok && r.value.product).toBe('creds.pro.monthly');
  });
  test('an unpinned issuer is refused', async () => {
    expect(verifyProLicense(await mint(stranger), opts).ok).toBe(false);
  });
  test('expired, future and over-long licenses are refused', async () => {
    expect(verifyProLicense(await mint(), { ...opts, nowSeconds: NOW + 86_400 }).ok).toBe(false);
    expect(verifyProLicense(await mint(issuer, { iat: NOW + 3600, exp: NOW + 7200 }), opts).ok).toBe(false);
    expect(verifyProLicense(await mint(issuer, { exp: NOW + 8 * 86_400 }), opts).ok).toBe(false);
  });
  test('a license for another did is refused', async () => {
    expect(verifyProLicense(await mint(), { ...opts, sub: stranger.did }).ok).toBe(false);
  });
  test('a tampered payload is refused', async () => {
    const [h, , s] = (await mint()).split('.');
    const forged = btoa(JSON.stringify({ typ: LICENSE_TYP, sub: stranger.did, product: 'x', iat: NOW, exp: NOW + 86_400 }))
      .replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
    expect(verifyProLicense(`${h}.${forged}.${s}`, opts).ok).toBe(false);
  });
  test('licenseExpiry never passes the store expiry or 7 days', () => {
    expect(licenseExpiry(NOW, NOW + 30 * 86_400)).toBe(NOW + 7 * 86_400);
    expect(licenseExpiry(NOW, NOW + 3600)).toBe(NOW + 3600);
  });
});
