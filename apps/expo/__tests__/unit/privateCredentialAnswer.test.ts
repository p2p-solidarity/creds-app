/**
 * `src/privateExchange/credentialAnswer.ts` — the requester verifying a
 * private credential answer (docs/ref/16 §12.1).
 *
 * Failure modes, listed before the code:
 *  vp        not a JWT; signed for another requester (aud); another request's
 *            nonce; embeds a VC bound to another holder.
 *  time      presented before the request was sent or after it closed; an
 *            answer read days later but made inside the window is fine.
 *  binding   signed by a root DID other than the sender's Page; vouches for
 *            another card key.
 *  honesty   a VC the presenter issued to themselves is "self"; any other
 *            did:key issuer is "unknown" — never shown as more.
 */
import { describe, expect, it } from 'bun:test';
import { p256 } from '@noble/curves/nist.js';

import {
  buildCardKeyBindingJws,
  didKeyFromPublicKey,
  publicKeyFromPrivate,
  signJwtEs256,
  type Signer,
} from '@solidarity/shared';

import { verifyCredentialAnswer } from '../../src/privateExchange/credentialAnswer';

const key = (seed: number) => {
  const priv = new Uint8Array(32).map((_, i) => (i * seed + 1) & 0xff);
  return { priv, did: didKeyFromPublicKey(publicKeyFromPrivate(priv)) };
};
const ROOT = key(3);
const CARD = key(5);
const ISSUER = key(7);
const OTHER = key(11);
const signer = (priv: Uint8Array): Signer => async (digest) => p256.sign(digest, priv, { prehash: false });

const NOW = 1_762_300_000;
const SENT_AT = NOW - 2 * 86_400;
const EXP = NOW + 5 * 86_400;
const AUD = 'nostr:npub1requester';
const NONCE = 'ab'.repeat(32);
const ctx = { senderRootDid: ROOT.did, aud: AUD, nonce: NONCE, requestSentAt: SENT_AT, requestExp: EXP, nowSeconds: NOW };

function vc(issuer = ISSUER, holder = CARD.did): string {
  return signJwtEs256(
    { alg: 'ES256', kid: `${issuer.did}#0` },
    {
      iss: issuer.did,
      sub: holder,
      iat: SENT_AT - 86_400,
      vc: { type: ['VerifiableCredential', 'MembershipCredential'], credentialSubject: { id: holder, member: 'Solidarity Lab' } },
    },
    issuer.priv
  );
}

function vp(vcs: readonly string[], over: { iat?: number; aud?: string; nonce?: string; holder?: typeof CARD } = {}): string {
  const holder = over.holder ?? CARD;
  const iat = over.iat ?? NOW - 86_400;
  return signJwtEs256(
    { alg: 'ES256', typ: 'vp+jwt', kid: `${holder.did}#0` },
    {
      iss: holder.did,
      sub: holder.did,
      iat,
      exp: EXP,
      aud: over.aud ?? AUD,
      nonce: over.nonce ?? NONCE,
      vp: { '@context': ['https://www.w3.org/2018/credentials/v1'], type: ['VerifiablePresentation'], holder: holder.did, verifiableCredential: vcs },
    },
    holder.priv
  );
}

function binding(over: { root?: typeof ROOT; cardDid?: string; iat?: number } = {}): Promise<string> {
  const root = over.root ?? ROOT;
  return buildCardKeyBindingJws({
    rootDid: root.did,
    cardDid: over.cardDid ?? CARD.did,
    aud: AUD,
    nonce: NONCE,
    iat: over.iat ?? NOW - 86_400,
    exp: EXP,
    sign: signer(root.priv),
  });
}

async function check(wire: { vp: string; binding: string }): Promise<string> {
  const r = await verifyCredentialAnswer(wire, ctx);
  return r.ok ? `ok:${r.value.credentials.map((c) => c.issuer).join(',')}` : r.error;
}

describe('verifyCredentialAnswer', () => {
  it('accepts an answer made inside the request window, read a day later', async () => {
    const r = await verifyCredentialAnswer({ vp: vp([vc()]), binding: await binding() }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.cardDid).toBe(CARD.did);
    expect(r.value.credentials[0]).toMatchObject({
      issuerDid: ISSUER.did,
      type: 'MembershipCredential',
      issuer: 'unknown',
      fields: [{ name: 'member', value: 'Solidarity Lab' }],
    });
  });

  it('calls a credential the presenter issued to themselves "self"', async () => {
    expect(await check({ vp: vp([vc(CARD)]), binding: await binding() })).toBe('ok:self');
  });

  it('rejects a VP for another requester, another request, or a foreign credential', async () => {
    expect(await check({ vp: vp([vc()], { aud: 'nostr:npub1other' }), binding: await binding() })).toBe('vpRejected');
    expect(await check({ vp: vp([vc()], { nonce: 'cd'.repeat(32) }), binding: await binding() })).toBe('nonceMismatch');
    expect(await check({ vp: vp([vc(ISSUER, OTHER.did)]), binding: await binding() })).toBe('vpRejected');
    expect(await check({ vp: 'not-a-jwt', binding: await binding() })).toBe('malformed');
  });

  it('rejects a VP presented before the request or after it closed', async () => {
    expect(await check({ vp: vp([vc()], { iat: SENT_AT - 3600 }), binding: await binding() })).toBe('notCurrent');
    const late = { ...ctx, requestExp: NOW - 86_400 * 1.5 };
    const r = await verifyCredentialAnswer({ vp: vp([vc()]), binding: await binding() }, late);
    expect(r.ok ? 'ok' : r.error).toBe('notCurrent');
  });

  it('rejects a binding from another root DID or for another card key', async () => {
    expect(await check({ vp: vp([vc()]), binding: await binding({ root: OTHER }) })).toBe('bindingRejected');
    expect(await check({ vp: vp([vc()]), binding: await binding({ cardDid: OTHER.did }) })).toBe('bindingRejected');
  });
});
