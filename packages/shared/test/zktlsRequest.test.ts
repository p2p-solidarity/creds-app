import { describe, expect, test } from 'bun:test';

import { buildNip98Authorization } from '../src/nip05/client';
import { signNostrEventWithScalar, type UnsignedNostrEvent } from '../src/nostr/event';
import { checkNotaryRequest, notaryEvidenceUrl, notarySessionUrl } from '../src/zktls';

const ORIGIN = 'https://notary.creds.id';
const NOW = 1_800_000_000;
const SID = 'ab'.repeat(16);
const scalar = new Uint8Array(32).fill(7);
const sign = async (unsigned: UnsignedNostrEvent) => signNostrEventWithScalar(unsigned, scalar, NOW);

async function auth(url: string, method = 'GET'): Promise<string> {
  const header = await buildNip98Authorization(url, method, null, sign);
  if (!header.ok) throw new Error(header.error);
  return header.value;
}

const xSession = notarySessionUrl(ORIGIN, { platform: 'x', handle: 'alice', name: 'alice', sid: SID });

async function check(url: string, overrides: { authorization?: string; method?: string; now?: number; seen?: Set<string> } = {}) {
  return checkNotaryRequest({
    authorization: overrides.authorization ?? (await auth(url)),
    method: overrides.method ?? 'GET',
    url,
    now: overrides.now ?? NOW,
    seen: overrides.seen ?? new Set(),
  });
}

describe('checkNotaryRequest', () => {
  test('accepts a signed session request for an allowlisted profile', async () => {
    const result = await check(xSession);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.kind !== 'session') return;
    expect(result.value.platform).toBe('x');
    expect(result.value.handle).toBe('alice');
    expect(result.value.server).toBe('x.com');
    expect(result.value.request).toBe('GET /alice HTTP/1.1');
    expect(result.value.sid).toBe(SID);
  });

  test('accepts a signed evidence pickup', async () => {
    const result = await check(notaryEvidenceUrl(ORIGIN, SID));
    expect(result.ok && result.value.kind).toBe('evidence');
  });

  test('rejects a missing or garbled Authorization header', async () => {
    expect((await check(xSession, { authorization: '' })).ok).toBe(false);
    expect((await check(xSession, { authorization: 'Nostr !!!' })).ok).toBe(false);
  });

  test('rejects an event of another kind', async () => {
    const event = signNostrEventWithScalar({ kind: 1, tags: [['u', xSession], ['method', 'GET']], content: '' }, scalar, NOW);
    if (!event.ok) throw new Error(event.error);
    const header = `Nostr ${Buffer.from(JSON.stringify(event.value)).toString('base64')}`;
    expect((await check(xSession, { authorization: header })).ok).toBe(false);
  });

  test('rejects a tampered signature', async () => {
    const header = await auth(xSession);
    const event = JSON.parse(Buffer.from(header.slice(6), 'base64').toString());
    event.created_at += 1;
    const tampered = `Nostr ${Buffer.from(JSON.stringify(event)).toString('base64')}`;
    expect((await check(xSession, { authorization: tampered })).ok).toBe(false);
  });

  test('rejects an expired event', async () => {
    expect((await check(xSession, { now: NOW + 61 })).ok).toBe(false);
  });

  test('rejects a replayed event', async () => {
    const header = await auth(xSession);
    const first = await check(xSession, { authorization: header });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect((await check(xSession, { authorization: header, seen: new Set([first.value.eventId]) })).ok).toBe(false);
  });

  test('rejects an event signed for a different URL', async () => {
    const bob = notarySessionUrl(ORIGIN, { platform: 'x', handle: 'bob', name: 'alice', sid: SID });
    expect((await check(xSession, { authorization: await auth(bob) })).ok).toBe(false);
  });

  test('rejects a method other than GET', async () => {
    expect((await check(xSession, { method: 'POST', authorization: await auth(xSession, 'POST') })).ok).toBe(false);
  });

  test('rejects a platform outside the allowlist', async () => {
    expect((await check(`${ORIGIN}/v1/session?platform=instagram&handle=alice&name=alice&sid=${SID}`)).ok).toBe(false);
  });

  test('rejects a handle outside the platform pattern', async () => {
    expect((await check(`${ORIGIN}/v1/session?platform=x&handle=..%2Fadmin&name=alice&sid=${SID}`)).ok).toBe(false);
  });

  test('rejects a website on a private or local host', async () => {
    for (const host of ['localhost', '127.0.0.1', '169.254.169.254', 'metadata.internal']) {
      const url = notarySessionUrl(ORIGIN, { platform: 'website', handle: host, name: 'alice', sid: SID });
      expect((await check(url)).ok).toBe(false);
    }
  });

  test('rejects a malformed session id or creds name', async () => {
    expect((await check(notarySessionUrl(ORIGIN, { platform: 'x', handle: 'alice', name: 'alice', sid: 'short' }))).ok).toBe(false);
    expect((await check(notarySessionUrl(ORIGIN, { platform: 'x', handle: 'alice', name: 'Al!ce', sid: SID }))).ok).toBe(false);
  });

  test('rejects duplicated or extra query parameters', async () => {
    expect((await check(`${xSession}&handle=bob`)).ok).toBe(false);
    expect((await check(`${xSession}&host=evil.example`)).ok).toBe(false);
  });

  test('rejects an unknown path', async () => {
    expect((await check(`${ORIGIN}/v1/admin`)).ok).toBe(false);
  });
});
