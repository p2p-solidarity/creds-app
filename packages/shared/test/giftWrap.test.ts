/**
 * NIP-59 gift wrap (src/nostr/giftWrap.ts), as NIP-17 uses it.
 *
 * Failure modes, listed before the code (docs/ref/16 §6):
 *  wrap    not kind 1059, id or signature wrong, `p` is not me, content too large,
 *          content does not decrypt (MAC / padding / version).
 *  seal    not JSON / not an event / not kind 13, bad signature, tags not empty,
 *          content does not decrypt.
 *  rumor   missing fields, id ≠ recomputed id, pubkey ≠ seal pubkey (impersonation),
 *          created_at in the future.
 *  interop the NIP-59 reference example decrypts to its text; what we wrap unwraps.
 */
import { describe, expect, it } from 'bun:test';

import { nip44ConversationKey, nip44Encrypt } from '../src/crypto/nip44';
import { hexToBytes } from '../src/crypto/hex';
import { nostrPublicKeyHex, signNostrEventWithScalar, type NostrEvent } from '../src/nostr/event';
import { createRumor, unwrapGiftWrap, wrapRumor, type Rumor } from '../src/nostr/giftWrap';

const SENDER = hexToBytes('11'.repeat(32));
const RECIPIENT = hexToBytes('22'.repeat(32));
const STRANGER = hexToBytes('33'.repeat(32));
const SENDER_HEX = nostrPublicKeyHex(SENDER);
const RECIPIENT_HEX = nostrPublicKeyHex(RECIPIENT);
const STRANGER_HEX = nostrPublicKeyHex(STRANGER);
const NOW = 1_762_300_000;

function rumor(overrides: Partial<Parameters<typeof createRumor>[0]> = {}): Rumor {
  return createRumor(
    { kind: 4410, tags: [['p', RECIPIENT_HEX]], content: '{"hello":1}', created_at: NOW - 10, ...overrides },
    SENDER_HEX
  );
}

function wrapped(r: Rumor = rumor()): NostrEvent {
  const res = wrapRumor(r, SENDER, RECIPIENT_HEX, { nowSeconds: NOW });
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

/** Build a wrap by hand so a test can plant a broken seal inside it. */
function wrapSealJson(sealJson: string, to: string = RECIPIENT_HEX): NostrEvent {
  const eph = hexToBytes('44'.repeat(32));
  const content = nip44Encrypt(nip44ConversationKey(eph, hexToBytes(to)), sealJson);
  const res = signNostrEventWithScalar({ kind: 1059, tags: [['p', to]], content, created_at: NOW - 100 }, eph);
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

function sealOf(r: object, tags: string[][] = [], signer: Uint8Array = SENDER): NostrEvent {
  const content = nip44Encrypt(nip44ConversationKey(signer, hexToBytes(RECIPIENT_HEX)), JSON.stringify(r));
  const res = signNostrEventWithScalar({ kind: 13, tags, content, created_at: NOW - 50 }, signer);
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

function expectReject(wrap: unknown, reason: string, scalar: Uint8Array = RECIPIENT): void {
  const res = unwrapGiftWrap(wrap, scalar, { nowSeconds: NOW });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.error).toBe(reason as never);
}

describe('wrapRumor → unwrapGiftWrap round trip', () => {
  it('recovers the rumor and the authenticated sender', () => {
    const r = rumor();
    const res = unwrapGiftWrap(wrapped(r), RECIPIENT, { nowSeconds: NOW });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.rumor).toEqual(r);
    expect(res.value.senderHex).toBe(SENDER_HEX);
  });

  it('hides the sender: wrap is signed by a one-time key, p-tags the recipient, times in the past 2 days', () => {
    const a = wrapped();
    const b = wrapped();
    expect(a.kind).toBe(1059);
    expect(a.pubkey).not.toBe(SENDER_HEX);
    expect(a.pubkey).not.toBe(b.pubkey);
    expect(a.tags).toEqual([['p', RECIPIENT_HEX]]);
    expect(a.created_at).toBeLessThanOrEqual(NOW);
    expect(a.created_at).toBeGreaterThanOrEqual(NOW - 2 * 86_400);
  });

  it('only the recipient can open it', () => {
    expectReject(wrapped(), 'notForMe', STRANGER);
  });
});

describe('NIP-59 reference example', () => {
  // https://github.com/nostr-protocol/nips/blob/master/59.md "An Example"
  const recipient = hexToBytes('e108399bd8424357a710b606ae0c13166d853d327e47a6e5e038197346bdbf45');
  const wrap = {
    content:
      'AhC3Qj/QsKJFWuf6xroiYip+2yK95qPwJjVvFujhzSguJWb/6TlPpBW0CGFwfufCs2Zyb0JeuLmZhNlnqecAAalC4ZCugB+I9ViA5pxLyFfQjs1lcE6KdX3euCHBLAnE9GL/+IzdV9vZnfJH6atVjvBkNPNzxU+OLCHO/DAPmzmMVx0SR63frRTCz6Cuth40D+VzluKu1/Fg2Q1LSst65DE7o2efTtZ4Z9j15rQAOZfE9jwMCQZt27rBBK3yVwqVEriFpg2mHXc1DDwHhDADO8eiyOTWF1ghDds/DxhMcjkIi/o+FS3gG1dG7gJHu3KkGK5UXpmgyFKt+421m5o++RMD/BylS3iazS1S93IzTLeGfMCk+7IKxuSCO06k1+DaasJJe8RE4/rmismUvwrHu/HDutZWkvOAhd4z4khZo7bJLtiCzZCZ74lZcjOB4CYtuAX2ZGpc4I1iOKkvwTuQy9BWYpkzGg3ZoSWRD6ty7U+KN+fTTmIS4CelhBTT15QVqD02JxfLF7nA6sg3UlYgtiGw61oH68lSbx16P3vwSeQQpEB5JbhofW7t9TLZIbIW/ODnI4hpwj8didtk7IMBI3Ra3uUP7ya6vptkd9TwQkd/7cOFaSJmU+BIsLpOXbirJACMn+URoDXhuEtiO6xirNtrPN8jYqpwvMUm5lMMVzGT3kMMVNBqgbj8Ln8VmqouK0DR+gRyNb8fHT0BFPwsHxDskFk5yhe5c/2VUUoKCGe0kfCcX/EsHbJLUUtlHXmTqaOJpmQnW1tZ/siPwKRl6oEsIJWTUYxPQmrM2fUpYZCuAo/29lTLHiHMlTbarFOd6J/ybIbICy2gRRH/LFSryty3Cnf6aae+A9uizFBUdCwTwffc3vCBae802+R92OL78bbqHKPbSZOXNC+6ybqziezwG+OPWHx1Qk39RYaF0aFsM4uZWrFic97WwVrH5i+/Nsf/OtwWiuH0gV/SqvN1hnkxCTF/+XNn/laWKmS3e7wFzBsG8+qwqwmO9aVbDVMhOmeUXRMkxcj4QreQkHxLkCx97euZpC7xhvYnCHarHTDeD6nVK+xzbPNtzeGzNpYoiMqxZ9bBJwMaHnEoI944Vxoodf51cMIIwpTmmRvAzI1QgrfnOLOUS7uUjQ/IZ1Qa3lY08Nqm9MAGxZ2Ou6R0/Z5z30ha/Q71q6meAs3uHQcpSuRaQeV29IASmye2A2Nif+lmbhV7w8hjFYoaLCRsdchiVyNjOEM4VmxUhX4VEvw6KoCAZ/XvO2eBF/SyNU3Of4SO',
    kind: 1059,
    created_at: 1703021488,
    pubkey: '18b1a75918f1f2c90c23da616bce317d36e348bcf5f7ba55e75949319210c87c',
    id: '5c005f3ccf01950aa8d131203248544fb1e41a0d698e846bd419cec3890903ac',
    sig: '35fabdae4634eb630880a1896a886e40fd6ea8a60958e30b89b33a93e6235df750097b04f9e13053764251b8bc5dd7e8e0794a3426a90b6bcc7e5ff660f54259',
    tags: [['p', '166bf3765ebd1fc55decfe395beff2ea3b2a4e0a8946e7eb578512b555737c99']],
  };

  it('decrypts to the published rumor', () => {
    const res = unwrapGiftWrap(wrap, recipient, { nowSeconds: NOW });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.rumor.content).toBe('Are you going to the party tonight?');
    expect(res.value.rumor.kind).toBe(1);
    expect(res.value.senderHex).toBe('611df01bfcf85c26ae65453b772d8f1dfd25c264621c0277e1fc1518686faef9');
  });
});

describe('wrap layer', () => {
  it('rejects anything that is not a signed kind 1059', () => {
    expectReject(null, 'notGiftWrap');
    expectReject({ ...wrapped(), kind: 1 }, 'notGiftWrap');
    expectReject({ ...wrapped(), content: wrapped().content }, 'badWrapSignature');
    const w = wrapped();
    expectReject({ ...w, sig: w.sig.replace(/^./u, w.sig[0] === 'a' ? 'b' : 'a') }, 'badWrapSignature');
  });

  it('rejects a wrap p-tagged to someone else before trying to decrypt', () => {
    expectReject(wrapSealJson('{}', STRANGER_HEX), 'notForMe');
  });

  it('rejects oversized content before decrypting', () => {
    const eph = hexToBytes('44'.repeat(32));
    const res = signNostrEventWithScalar({ kind: 1059, tags: [['p', RECIPIENT_HEX]], content: 'A'.repeat(100_000) }, eph);
    if (!res.ok) throw new Error(res.error);
    expectReject(res.value, 'tooLarge');
  });

  it('rejects content that does not decrypt', () => {
    const eph = hexToBytes('44'.repeat(32));
    const garbage = nip44Encrypt(nip44ConversationKey(eph, hexToBytes(STRANGER_HEX)), 'x');
    const res = signNostrEventWithScalar({ kind: 1059, tags: [['p', RECIPIENT_HEX]], content: garbage }, eph);
    if (!res.ok) throw new Error(res.error);
    expectReject(res.value, 'wrapDecryptFailed');
  });
});

describe('seal layer', () => {
  it('rejects a seal that is not an event or not kind 13', () => {
    expectReject(wrapSealJson('not json'), 'malformedSeal');
    expectReject(wrapSealJson('{"kind":13}'), 'malformedSeal');
    const notSeal = signNostrEventWithScalar({ kind: 1, tags: [], content: 'x' }, SENDER);
    if (!notSeal.ok) throw new Error(notSeal.error);
    expectReject(wrapSealJson(JSON.stringify(notSeal.value)), 'malformedSeal');
  });

  it('rejects a seal with a bad signature', () => {
    const seal = sealOf(rumor());
    expectReject(wrapSealJson(JSON.stringify({ ...seal, content: seal.content.slice(0, -4) + 'AAA=' })), 'badSealSignature');
  });

  it('rejects a seal with tags (NIP-59: MUST be empty)', () => {
    expectReject(wrapSealJson(JSON.stringify(sealOf(rumor(), [['p', RECIPIENT_HEX]]))), 'sealHasTags');
  });

  it('rejects seal content that does not decrypt', () => {
    const content = nip44Encrypt(nip44ConversationKey(SENDER, hexToBytes(STRANGER_HEX)), '{}');
    const seal = signNostrEventWithScalar({ kind: 13, tags: [], content }, SENDER);
    if (!seal.ok) throw new Error(seal.error);
    expectReject(wrapSealJson(JSON.stringify(seal.value)), 'sealDecryptFailed');
  });
});

describe('rumor layer', () => {
  it('rejects a rumor with missing fields', () => {
    const { id: _id, ...noId } = rumor();
    expectReject(wrapSealJson(JSON.stringify(sealOf(noId))), 'malformedRumor');
    expectReject(wrapSealJson(JSON.stringify(sealOf({ ...rumor(), tags: 'x' }))), 'malformedRumor');
  });

  it('rejects a rumor whose id is not its hash', () => {
    expectReject(wrapSealJson(JSON.stringify(sealOf({ ...rumor(), content: 'edited' }))), 'rumorIdMismatch');
  });

  it('rejects a rumor claiming a different author than the seal signer (impersonation)', () => {
    const forged = createRumor({ kind: 4410, tags: [['p', RECIPIENT_HEX]], content: 'hi', created_at: NOW }, STRANGER_HEX);
    expectReject(wrapSealJson(JSON.stringify(sealOf(forged))), 'senderMismatch');
  });

  it('rejects a rumor dated in the future', () => {
    expectReject(wrapped(rumor({ created_at: NOW + 3600 })), 'rumorFromFuture');
  });

  it('never throws on hostile input', () => {
    for (const input of [undefined, 1, 'x', [], { kind: 1059 }, { ...wrapped(), tags: [['p']] }]) {
      expect(() => unwrapGiftWrap(input, RECIPIENT, { nowSeconds: NOW })).not.toThrow();
    }
  });
});
