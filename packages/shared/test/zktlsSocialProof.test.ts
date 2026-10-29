import { describe, expect, test } from 'bun:test';
import { p256 } from '@noble/curves/nist.js';

import type { Signer } from '../src/jws';
import { didKeyFromPublicKey, generateP256KeyPair } from '../src/identity';
import { hexToNpub } from '../src/nostr/npub';
import {
  pageSocialClaim,
  signEvidence,
  signNotaryCert,
  verifyPageSocialProof,
  verifySocialProof,
  type EvidencePayload,
  type NotaryBundle,
  type SocialProof,
} from '../src/zktls';

function key() {
  const pair = generateP256KeyPair();
  const signer: Signer = async (digest) => p256.sign(digest, pair.privateKey, { prehash: false });
  return { did: didKeyFromPublicKey(pair.publicKey), signer };
}

const root = key();
const monthly = key();
const NBF = 1_800_000_000;
const T = NBF + 1000;
const ALICE_HEX = '11'.repeat(32);
const MALLORY_HEX = '22'.repeat(32);
const npubOf = (hex: string) => {
  const r = hexToNpub(hex);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const ALICE = npubOf(ALICE_HEX);
const MALLORY = npubOf(MALLORY_HEX);
const opts = { roots: [root.did] };

let cert = '';
async function evidence(p: Omit<EvidencePayload, 'typ' | 'iat' | 'tlsn' | 'npub'> & { iat?: number; npub?: string }): Promise<NotaryBundle> {
  if (cert === '') cert = await signNotaryCert({ keyDid: monthly.did, nbf: NBF, exp: NBF + 31 * 86_400 }, root.did, root.signer);
  const payload: EvidencePayload = { typ: 'creds.zktls.evidence/v1', iat: T, tlsn: '0.1.0-alpha.15', npub: ALICE, ...p };
  return { cert, evidence: await signEvidence(payload, monthly.did, monthly.signer) };
}

const telegramBio = (bio: string, handle = 'alice_tg') =>
  evidence({ platform: 'telegram', handle, server: 't.me', request: `GET /${handle} HTTP/1.1`, revealed: `<meta property="og:description" content="${bio}` });
const nameEvidence = (name = 'alice', hex = ALICE_HEX, npub?: string) =>
  evidence({ platform: 'creds-name', handle: name, server: 'creds.id', request: `GET /.well-known/nostr.json?name=${name} HTTP/1.1`, revealed: `"names":{"${name}":"${hex}`, ...(npub ? { npub } : {}) });
const xBio = (bio: string) =>
  evidence({ platform: 'x', handle: 'alice', server: 'x.com', request: 'GET /alice HTTP/1.1', revealed: `<meta name="description" content="${bio}` });
const tco = (id: string, title: string) =>
  evidence({ platform: 'x-link', handle: id, server: 't.co', request: `GET /${id} HTTP/1.1`, revealed: `<title>${title}` });

async function telegramProof(over: Partial<SocialProof> = {}): Promise<SocialProof> {
  return {
    v: 1,
    platform: 'telegram',
    handle: 'alice_tg',
    name: 'alice',
    profile: await telegramBio('builder · creds.id/@alice'),
    links: [],
    nameEvidence: await nameEvidence(),
    ...over,
  };
}

async function xProof(over: Partial<SocialProof> = {}): Promise<SocialProof> {
  return {
    v: 1,
    platform: 'x',
    handle: 'alice',
    name: 'alice',
    profile: await xBio('builder · https://t.co/AbC123'),
    links: [await tco('AbC123', 'https://creds.id/@alice')],
    nameEvidence: await nameEvidence(),
    ...over,
  };
}

describe('verifySocialProof', () => {
  test('accepts a Telegram bio carrying the marker, bound to the npub by name evidence', async () => {
    const result = verifySocialProof(await telegramProof(), ALICE, opts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ platform: 'telegram', handle: 'alice_tg', name: 'alice', verifiedAt: T });
  });

  test('accepts an X bio whose t.co link resolves to the marker', async () => {
    expect(verifySocialProof(await xProof(), ALICE, opts).ok).toBe(true);
  });

  test('rejects profile evidence for another handle than claimed', async () => {
    expect(verifySocialProof(await telegramProof({ handle: 'someone_else' }), ALICE, opts).ok).toBe(false);
  });

  test('rejects a bio without the marker, or with another name', async () => {
    expect(verifySocialProof(await telegramProof({ profile: await telegramBio('just a bio') }), ALICE, opts).ok).toBe(false);
    expect(verifySocialProof(await telegramProof({ profile: await telegramBio('creds.id/@alicex') }), ALICE, opts).ok).toBe(false);
  });

  test('rejects an X t.co hop that is not in the bio', async () => {
    const links = [await tco('Zzz999', 'https://creds.id/@alice')];
    expect(verifySocialProof(await xProof({ links }), ALICE, opts).ok).toBe(false);
  });

  test('rejects an X t.co hop that does not lead to the marker', async () => {
    const links = [await tco('AbC123', 'https://example.com')];
    expect(verifySocialProof(await xProof({ links }), ALICE, opts).ok).toBe(false);
  });

  test('rejects name evidence for another name or another pubkey', async () => {
    expect(verifySocialProof(await telegramProof({ nameEvidence: await nameEvidence('bob') }), ALICE, opts).ok).toBe(false);
    expect(verifySocialProof(await telegramProof({ nameEvidence: await nameEvidence('alice', MALLORY_HEX) }), ALICE, opts).ok).toBe(false);
  });

  test('rejects evidence requested by a different npub than the Page claims', async () => {
    expect(verifySocialProof(await telegramProof(), MALLORY, opts).ok).toBe(false);
    const mixed = await telegramProof({ nameEvidence: await nameEvidence('alice', ALICE_HEX, MALLORY) });
    expect(verifySocialProof(mixed, ALICE, opts).ok).toBe(false);
  });

  test('rejects pieces witnessed far apart', async () => {
    const old = await evidence({ platform: 'creds-name', handle: 'alice', server: 'creds.id', request: 'GET /.well-known/nostr.json?name=alice HTTP/1.1', revealed: `"names":{"alice":"${ALICE_HEX}`, iat: T - 3600 });
    expect(verifySocialProof(await telegramProof({ nameEvidence: old }), ALICE, opts).ok).toBe(false);
  });

  test('a website must reveal exactly this name’s marker', async () => {
    const site = (marker: string) =>
      evidence({ platform: 'website', handle: 'alice.dev', server: 'alice.dev', request: 'GET / HTTP/1.1', revealed: marker });
    const base = { platform: 'website' as const, handle: 'alice.dev' };
    expect(verifySocialProof(await telegramProof({ ...base, profile: await site('creds.id/@alice') }), ALICE, opts).ok).toBe(true);
    expect(verifySocialProof(await telegramProof({ ...base, profile: await site('creds.id/@bob') }), ALICE, opts).ok).toBe(false);
  });
});

/**
 * x.com embeds its own GraphQL result as a JS string: JSON text, escaped once more
 * (`"` → `\"`). These fixtures are built the same way so the verifier sees real bytes.
 */
const X_PROFILE_START = '{\\"data\\":{\\"user_result_by_screen_name\\":';
type XUrls = readonly { expanded_url: string; display_url?: string }[];
function xProfilePayload(p: { screenName?: string; bioUrls?: XUrls; siteUrls?: XUrls; extra?: Record<string, unknown> } = {}): string {
  const result = {
    __typename: 'User',
    core: { screen_name: p.screenName ?? 'alice' },
    ...p.extra,
    profile_bio: {
      description: 'builder',
      entities: {
        description: { urls: (p.bioUrls ?? []).map((u) => ({ display_url: u.expanded_url.replace(/^https?:\/\//u, ''), ...u, url: 'https://t.co/AbC123' })) },
        ...(p.siteUrls ? { url: { urls: p.siteUrls.map((u) => ({ display_url: u.expanded_url.replace(/^https?:\/\//u, ''), ...u, url: 'https://t.co/Site12' })) } } : {}),
      },
    },
    rest_id: '1',
  };
  const json = JSON.stringify({ data: { user_result_by_screen_name: { id: 'VXNlcjox', result } } });
  return JSON.stringify(json).slice(1, -1);
}
const xProfile = (revealed: string, handle = 'alice') =>
  evidence({ platform: 'x-profile', handle, server: 'x.com', request: `GET /${handle} HTTP/1.1`, revealed });
async function xProfileProof(revealed: string, over: Partial<SocialProof> = {}): Promise<SocialProof> {
  return { v: 1, platform: 'x', handle: 'alice', name: 'alice', profile: await xProfile(revealed), links: [], nameEvidence: await nameEvidence(), ...over };
}

describe('X profile evidence (bio links and the website field, one hop)', () => {
  test('fixtures start exactly where the prover anchors', () => {
    expect(xProfilePayload().startsWith(X_PROFILE_START)).toBe(true);
  });

  test('accepts the marker as a bio link, with no t.co hop', async () => {
    const proof = await xProfileProof(xProfilePayload({ bioUrls: [{ expanded_url: 'https://creds.id/@alice' }] }));
    expect(verifySocialProof(proof, ALICE, opts).ok).toBe(true);
  });

  test('accepts the marker in the profile website field', async () => {
    const proof = await xProfileProof(xProfilePayload({ siteUrls: [{ expanded_url: 'http://creds.id/@alice' }] }));
    expect(verifySocialProof(proof, ALICE, opts).ok).toBe(true);
  });

  test('accepts www and a trailing slash, and a differently cased screen name', async () => {
    const revealed = xProfilePayload({ screenName: 'Alice', siteUrls: [{ expanded_url: 'https://www.creds.id/@alice/' }] });
    expect(verifySocialProof(await xProfileProof(revealed), ALICE, opts).ok).toBe(true);
  });

  test('rejects another name, a look-alike host or a longer path', async () => {
    for (const url of ['https://creds.id/@alicex', 'https://notcreds.id/@alice', 'https://creds.id.evil.com/@alice', 'https://creds.id/@alice/x', 'creds.id/@alice']) {
      const proof = await xProfileProof(xProfilePayload({ siteUrls: [{ expanded_url: url }] }));
      expect(verifySocialProof(proof, ALICE, opts).ok).toBe(false);
    }
  });

  test('rejects a link whose shown text is the marker but which leads elsewhere', async () => {
    const proof = await xProfileProof(xProfilePayload({ siteUrls: [{ expanded_url: 'https://evil.example', display_url: 'creds.id/@alice' }] }));
    expect(verifySocialProof(proof, ALICE, opts).ok).toBe(false);
  });

  test('rejects the marker anywhere outside the bio links and website field', async () => {
    const pinned = { legacy: { pinned_tweet: { entities: { urls: [{ expanded_url: 'https://creds.id/@alice' }] } } }, highlights_info: { url: { urls: [{ expanded_url: 'https://creds.id/@alice' }] } } };
    const proof = await xProfileProof(xProfilePayload({ extra: pinned }));
    expect(verifySocialProof(proof, ALICE, opts).ok).toBe(false);
  });

  test('rejects a profile payload that belongs to another account', async () => {
    const proof = await xProfileProof(xProfilePayload({ screenName: 'mallory', siteUrls: [{ expanded_url: 'https://creds.id/@alice' }] }));
    expect(verifySocialProof(proof, ALICE, opts).ok).toBe(false);
  });

  test('X profile evidence cannot stand in for another platform’s claim', async () => {
    const profile = await xProfile(xProfilePayload({ siteUrls: [{ expanded_url: 'https://creds.id/@alice' }] }));
    expect(verifySocialProof(await telegramProof({ handle: 'alice', profile }), ALICE, opts).ok).toBe(false);
  });
});

describe('verifyPageSocialProof', () => {
  const page = (alsoKnownAs: string[]) => ({ alsoKnownAs });

  test('accepts when the Page claims both the npub and the handle', async () => {
    const result = verifyPageSocialProof(page([`nostr:${ALICE}`, pageSocialClaim('telegram', 'alice_tg')]), await telegramProof(), opts);
    expect(result.ok).toBe(true);
  });

  test('rejects someone else’s proof attached to a Page (copy attack)', async () => {
    const result = verifyPageSocialProof(page([`nostr:${MALLORY}`, pageSocialClaim('telegram', 'alice_tg')]), await telegramProof(), opts);
    expect(result.ok).toBe(false);
  });

  test('rejects a proof for a handle the Page does not claim', async () => {
    expect(verifyPageSocialProof(page([`nostr:${ALICE}`]), await telegramProof(), opts).ok).toBe(false);
  });
});
