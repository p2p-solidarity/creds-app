/**
 * cardKeyBinding (src/cardKeyBinding.ts): the root DID vouching for the key
 * that signed a VP, for one requester and one request (docs/ref/16 §12).
 *
 * Failure modes, listed before the code:
 *  signature  signed by a different root DID than the sender's Page; not a JWS.
 *  claims     payload rootDid / cardDid differ from the expected ones; wrong typ;
 *             aud or nonce of another request; missing fields.
 *  time       iat before the request was sent or after it closed (async: not
 *             "near now"); exp before iat.
 */
import { describe, expect, it } from 'bun:test';
import { p256 } from '@noble/curves/nist.js';

import { buildCardKeyBindingJws, CARD_KEY_BINDING_TYPE, verifyCardKeyBinding } from '../src/cardKeyBinding';
import { hexToBytes } from '../src/crypto/hex';
import { didKeyFromPublicKey, publicKeyFromPrivate } from '../src/identity';
import { signCompact, type Signer } from '../src/jws';

// TEST-ONLY scalars.
const ROOT_PRIV = hexToBytes('0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20');
const OTHER_PRIV = hexToBytes('2102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20');
const ROOT_DID = didKeyFromPublicKey(publicKeyFromPrivate(ROOT_PRIV));
const OTHER_DID = didKeyFromPublicKey(publicKeyFromPrivate(OTHER_PRIV));
const CARD_DID = 'did:key:zDnaeaQHQpDWivip1SugnEwZaF5JUCmSyPrYewToLKYmv8CyV';
const signer = (priv: Uint8Array): Signer => async (digest) => p256.sign(digest, priv, { prehash: false });

const NOW = 1_762_300_000;
const AUD = 'nostr:npub1requester';
const NONCE = 'ab'.repeat(32);
const expected = {
  rootDid: ROOT_DID,
  cardDid: CARD_DID,
  aud: AUD,
  nonce: NONCE,
  notBefore: NOW - 86_400,
  notAfter: NOW + 86_400,
};

function build(over: Partial<{ iat: number; exp: number; cardDid: string; aud: string; nonce: string }> = {}, priv = ROOT_PRIV, did = ROOT_DID) {
  return buildCardKeyBindingJws({
    rootDid: did,
    cardDid: over.cardDid ?? CARD_DID,
    aud: over.aud ?? AUD,
    nonce: over.nonce ?? NONCE,
    iat: over.iat ?? NOW,
    exp: over.exp ?? NOW + 86_400,
    sign: signer(priv),
  });
}

describe('cardKeyBinding', () => {
  it('verifies a binding for this root, card, requester and request', async () => {
    const r = verifyCardKeyBinding(await build(), expected);
    expect(r.ok).toBe(true);
  });

  it('rejects a binding signed by another root DID', async () => {
    expect(verifyCardKeyBinding(await build({}, OTHER_PRIV, OTHER_DID), expected)).toEqual({ ok: false, error: 'badSignature' });
  });

  it('rejects a payload naming another root even when the signature checks', async () => {
    const jws = await signCompact(
      { typ: CARD_KEY_BINDING_TYPE, rootDid: OTHER_DID, cardDid: CARD_DID, aud: AUD, nonce: NONCE, iat: NOW, exp: NOW + 60 },
      ROOT_DID,
      signer(ROOT_PRIV)
    );
    expect(verifyCardKeyBinding(jws, expected)).toEqual({ ok: false, error: 'wrongRoot' });
  });

  it('rejects another card key, requester or request', async () => {
    expect(verifyCardKeyBinding(await build({ cardDid: OTHER_DID }), expected)).toEqual({ ok: false, error: 'wrongCard' });
    expect(verifyCardKeyBinding(await build({ aud: 'nostr:npub1other' }), expected)).toEqual({ ok: false, error: 'wrongAudience' });
    expect(verifyCardKeyBinding(await build({ nonce: 'cd'.repeat(32) }), expected)).toEqual({ ok: false, error: 'wrongNonce' });
  });

  it('rejects a wrong typ and missing fields', async () => {
    const wrongTyp = await signCompact(
      { typ: 'other', rootDid: ROOT_DID, cardDid: CARD_DID, aud: AUD, nonce: NONCE, iat: NOW, exp: NOW + 60 },
      ROOT_DID,
      signer(ROOT_PRIV)
    );
    expect(verifyCardKeyBinding(wrongTyp, expected)).toEqual({ ok: false, error: 'malformed' });
    const missing = await signCompact({ typ: CARD_KEY_BINDING_TYPE, rootDid: ROOT_DID }, ROOT_DID, signer(ROOT_PRIV));
    expect(verifyCardKeyBinding(missing, expected)).toEqual({ ok: false, error: 'malformed' });
    expect(verifyCardKeyBinding('not-a-jws', expected)).toEqual({ ok: false, error: 'badSignature' });
  });

  it('accepts any time inside the request window, not only near now', async () => {
    expect(verifyCardKeyBinding(await build({ iat: NOW - 80_000 }), expected).ok).toBe(true);
  });

  it('rejects a binding made before the request or after it closed, and exp before iat', async () => {
    expect(verifyCardKeyBinding(await build({ iat: NOW - 90_000 }), expected)).toEqual({ ok: false, error: 'outsideWindow' });
    expect(verifyCardKeyBinding(await build({ iat: NOW + 90_000, exp: NOW + 100_000 }), expected)).toEqual({ ok: false, error: 'outsideWindow' });
    expect(verifyCardKeyBinding(await build({ exp: NOW - 1 }), expected)).toEqual({ ok: false, error: 'malformed' });
  });
});
