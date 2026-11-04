/**
 * creds private messages inside NIP-17 rumors (src/nostr/privateMessage.ts)
 * and the kind 10050 DM relay list.
 *
 * Failure modes, listed before the code (docs/ref/16 §3, §6):
 *  rumor     not our kind, not p-tagged to me, content not JSON, unknown v/type,
 *            extra fields (strict).
 *  request   no claims, unknown claim, duplicate claims, > 8 claims, bad nonce,
 *            expired, expiry more than 7 days out, oversized purpose.
 *  response  no `e` tag naming the request, statement too large.
 *  contact   every field empty, fields over their limits.
 *  credential.request   bad nonce, oversized purpose, expired, expiry > 7 days,
 *            extra fields (no claim list: the holder picks).
 *  credential.response  no `e` tag, missing vp or binding, oversized vp/binding.
 *  binding   page must list nostr:<sender npub>; any other npub is not a binding.
 *  10050     only wss:// hostnames; IP literals, localhost, .local and other schemes
 *            dropped; de-duplicated; at most 3 kept.
 */
import { describe, expect, it } from 'bun:test';

import { hexToBytes } from '../src/crypto/hex';
import { nostrPublicKeyHex, signNostrEventWithScalar } from '../src/nostr/event';
import { createRumor, type Rumor } from '../src/nostr/giftWrap';
import { hexToNpub } from '../src/nostr/npub';
import {
  KIND_CREDS_PRIVATE,
  KIND_DM_RELAYS,
  buildContactShareRumor,
  buildCredentialRequestRumor,
  buildCredentialResponseRumor,
  buildDmRelayListEvent,
  buildProofRequestRumor,
  buildProofResponseRumor,
  pageBindsSender,
  parseDmRelayList,
  parsePrivateMessage,
} from '../src/nostr/privateMessage';

const SENDER_HEX = nostrPublicKeyHex(hexToBytes('11'.repeat(32)));
const ME_HEX = nostrPublicKeyHex(hexToBytes('22'.repeat(32)));
const OTHER_HEX = nostrPublicKeyHex(hexToBytes('33'.repeat(32)));
const NOW = 1_762_300_000;
const NONCE = 'ab'.repeat(32);

function asRumor(input: { kind: number; tags: readonly (readonly string[])[]; content: string }): Rumor {
  return createRumor({ ...input, created_at: NOW - 5 }, SENDER_HEX);
}

function request(overrides: Record<string, unknown> = {}): Rumor {
  const built = buildProofRequestRumor({
    recipientHex: ME_HEX,
    claims: ['passport.nationality'],
    nonce: NONCE,
    exp: NOW + 86_400,
    page: 'h.p.s',
  });
  const content = { ...(JSON.parse(built.content) as Record<string, unknown>), ...overrides };
  return asRumor({ ...built, content: JSON.stringify(content) });
}

function parse(r: Rumor) {
  return parsePrivateMessage({ rumor: r, senderHex: SENDER_HEX, wrapId: 'w'.repeat(64) }, ME_HEX, NOW);
}

function expectReject(r: Rumor, reason: string): void {
  const res = parse(r);
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.error).toBe(reason as never);
}

describe('parsePrivateMessage — rumor envelope', () => {
  it('accepts a proof request addressed to me', () => {
    const res = parse(request());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.message.type).toBe('proof.request');
    expect(res.value.senderHex).toBe(SENDER_HEX);
  });

  it('ignores other rumor kinds (e.g. kind 14 chat)', () => {
    expectReject(asRumor({ kind: 14, tags: [['p', ME_HEX]], content: 'hi' }), 'notCreds');
  });

  it('rejects a rumor not p-tagged to me', () => {
    const r = request();
    expectReject(asRumor({ kind: r.kind, tags: [['p', OTHER_HEX]], content: r.content }), 'notForMe');
  });

  it('rejects non-JSON, unknown version or type, and extra fields', () => {
    const tags = [['p', ME_HEX]];
    expectReject(asRumor({ kind: KIND_CREDS_PRIVATE, tags, content: 'nope' }), 'malformed');
    expectReject(request({ v: 2 }), 'malformed');
    expectReject(request({ type: 'card.request' }), 'malformed');
    expectReject(request({ extra: true }), 'malformed');
  });
});

describe('proof.request', () => {
  it('rejects bad claim lists', () => {
    expectReject(request({ claims: [] }), 'malformed');
    expectReject(request({ claims: ['passport.dob'] }), 'malformed');
    expectReject(request({ claims: ['passport.name', 'passport.name'] }), 'malformed');
  });

  it('rejects a bad nonce and an oversized purpose', () => {
    expectReject(request({ nonce: 'xyz' }), 'malformed');
    expectReject(request({ purpose: 'x'.repeat(141) }), 'malformed');
  });

  it('rejects an expired request and one that lives more than 7 days', () => {
    expectReject(request({ exp: NOW - 1 }), 'expired');
    expectReject(request({ exp: NOW + 8 * 86_400 }), 'expiryTooFar');
  });
});

describe('proof.response', () => {
  const passport = { statement: '{"v":1}', device: null };

  it('carries the request id from its e tag', () => {
    const built = buildProofResponseRumor({ recipientHex: ME_HEX, requestId: 'c'.repeat(64), page: 'h.p.s', passport });
    const res = parse(asRumor(built));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.replyTo).toBe('c'.repeat(64));
  });

  it('rejects a response that names no request', () => {
    const built = buildProofResponseRumor({ recipientHex: ME_HEX, requestId: 'c'.repeat(64), page: 'h.p.s', passport });
    expectReject(asRumor({ ...built, tags: [['p', ME_HEX]] }), 'malformed');
  });

  it('rejects an oversized statement', () => {
    const built = buildProofResponseRumor({
      recipientHex: ME_HEX,
      requestId: 'c'.repeat(64),
      page: 'h.p.s',
      passport: { statement: 'x'.repeat(3000), device: null },
    });
    expectReject(asRumor(built), 'malformed');
  });
});

describe('contact.share', () => {
  it('accepts at least one field and rejects none or oversized', () => {
    const ok = buildContactShareRumor({ recipientHex: ME_HEX, page: 'h.p.s', phone: '+81 90 0000 0000' });
    expect(parse(asRumor(ok)).ok).toBe(true);
    const none = buildContactShareRumor({ recipientHex: ME_HEX, page: 'h.p.s' });
    expectReject(asRumor(none), 'malformed');
    const long = buildContactShareRumor({ recipientHex: ME_HEX, page: 'h.p.s', note: 'x'.repeat(501) });
    expectReject(asRumor(long), 'malformed');
  });
});

describe('pageBindsSender', () => {
  const npub = hexToNpub(SENDER_HEX);
  if (!npub.ok) throw new Error(npub.error);

  it('requires nostr:<sender npub> in alsoKnownAs', () => {
    expect(pageBindsSender({ alsoKnownAs: [`nostr:${npub.value}`] }, SENDER_HEX)).toBe(true);
    expect(pageBindsSender({ alsoKnownAs: [] }, SENDER_HEX)).toBe(false);
    expect(pageBindsSender({ alsoKnownAs: [`nostr:${npub.value}`] }, OTHER_HEX)).toBe(false);
    expect(pageBindsSender({ alsoKnownAs: [npub.value] }, SENDER_HEX)).toBe(false);
  });
});

describe('kind 10050 DM relay list', () => {
  it('round-trips through an event', () => {
    const built = buildDmRelayListEvent(['wss://relay.damus.io', 'wss://nos.lol']);
    expect(built.kind).toBe(KIND_DM_RELAYS);
    const signed = signNostrEventWithScalar(built, hexToBytes('11'.repeat(32)));
    if (!signed.ok) throw new Error(signed.error);
    expect(parseDmRelayList(signed.value)).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
  });

  it('keeps only safe wss hostnames, de-duplicated, at most 3', () => {
    const relays = [
      'ws://insecure.example',
      'https://relay.example',
      'wss://127.0.0.1',
      'wss://[::1]',
      'wss://192.168.1.10:7777',
      'wss://localhost',
      'wss://printer.local',
      'wss://a.example',
      'wss://A.example/',
      'wss://b.example',
      'wss://c.example',
      'wss://d.example',
      'not a url',
    ];
    const event = { kind: KIND_DM_RELAYS, tags: relays.map((r) => ['relay', r]) };
    expect(parseDmRelayList(event)).toEqual(['wss://a.example', 'wss://b.example', 'wss://c.example']);
  });

  it('ignores other kinds and other tags', () => {
    expect(parseDmRelayList({ kind: 10002, tags: [['relay', 'wss://a.example']] })).toEqual([]);
    expect(parseDmRelayList({ kind: KIND_DM_RELAYS, tags: [['r', 'wss://a.example']] })).toEqual([]);
  });
});

describe('credential.request', () => {
  function credRequest(overrides: Record<string, unknown> = {}): Rumor {
    const built = buildCredentialRequestRumor({ recipientHex: ME_HEX, nonce: NONCE, exp: NOW + 86_400, purpose: 'check-in' });
    const content = { ...(JSON.parse(built.content) as Record<string, unknown>), ...overrides };
    return asRumor({ ...built, content: JSON.stringify(content) });
  }

  it('accepts a request with only a purpose, nonce and expiry', () => {
    const r = parse(credRequest());
    expect(r.ok && r.value.message.type).toBe('credential.request');
  });

  it('rejects a bad nonce, an oversized purpose and a claim list', () => {
    expectReject(credRequest({ nonce: 'zz' }), 'malformed');
    expectReject(credRequest({ purpose: 'x'.repeat(141) }), 'malformed');
    expectReject(credRequest({ claims: ['passport.name'] }), 'malformed');
  });

  it('rejects an expired request and one that lives more than 7 days', () => {
    expectReject(credRequest({ exp: NOW }), 'expired');
    expectReject(credRequest({ exp: NOW + 8 * 86_400 }), 'expiryTooFar');
  });
});

describe('credential.response', () => {
  const REQUEST_ID = 'cd'.repeat(32);
  function credResponse(overrides: Record<string, unknown> = {}, tags?: string[][]): Rumor {
    const built = buildCredentialResponseRumor({ recipientHex: ME_HEX, requestId: REQUEST_ID, vp: 'a.b.c', binding: 'd.e.f' });
    const content = { ...(JSON.parse(built.content) as Record<string, unknown>), ...overrides };
    return asRumor({ ...built, tags: tags ?? built.tags, content: JSON.stringify(content) });
  }

  it('carries the request id from its e tag', () => {
    const r = parse(credResponse());
    expect(r.ok && r.value.replyTo).toBe(REQUEST_ID);
  });

  it('rejects a response that names no request', () => {
    expectReject(credResponse({}, [['p', ME_HEX]]), 'malformed');
  });

  it('rejects a missing or oversized vp or binding', () => {
    expectReject(credResponse({ vp: undefined }), 'malformed');
    expectReject(credResponse({ binding: undefined }), 'malformed');
    expectReject(credResponse({ vp: 'x'.repeat(60_001) }), 'malformed');
    expectReject(credResponse({ binding: 'x'.repeat(4_001) }), 'malformed');
  });
});
