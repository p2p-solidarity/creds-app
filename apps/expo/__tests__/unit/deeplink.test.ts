/**
 * Deep-link parser — pure URL → route table.
 */
import { describe, expect, it } from 'bun:test';

import { parseDeepLink } from '../../src/deeplink/parser';

describe('parseDeepLink', () => {
  it('parses a solidarity:// card link', () => {
    const r = parseDeepLink('solidarity://card/f47ac10b-58cc-4372-a567-0e02b2c3d479');
    expect(r.kind).toBe('card');
    if (r.kind === 'card') {
      expect(r.cardId).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479');
    }
  });

  it('routes credsid:// the same as the legacy solidarity:// scheme', () => {
    expect(parseDeepLink('credsid://card/f47ac10b-58cc-4372-a567-0e02b2c3d479').kind).toBe('card');
    expect(parseDeepLink('credsid://websign?req=aaa.bbb.ccc').kind).toBe('webSign');
    expect(parseDeepLink('credsidx://card/f47ac10b-58cc-4372-a567-0e02b2c3d479').kind).toBe('unknown');
  });

  it('parses a https://solidarity.gg/c/<uuid> universal link', () => {
    const r = parseDeepLink('https://solidarity.gg/c/f47ac10b-58cc-4372-a567-0e02b2c3d479');
    expect(r.kind).toBe('card');
  });

  it('parses an openid4vp:// auth request', () => {
    const r = parseDeepLink('openid4vp://?client_id=https%3A%2F%2Fverifier.example&state=abc');
    expect(r.kind).toBe('oidc');
    if (r.kind === 'oidc') {
      expect(r.query).toContain('client_id=');
    }
  });

  it('parses a group invite', () => {
    const r = parseDeepLink('solidarity://group/eyJhbGciOiJFUzI1NiJ9.abc');
    expect(r.kind).toBe('groupInvite');
  });

  it('parses a credential offer', () => {
    const r = parseDeepLink('openid-credential-offer://?credential_offer=foo');
    expect(r.kind).toBe('credentialOffer');
  });

  it('treats an empty credential-offer URL as unknown (stale Android launch intent)', () => {
    // Android `singleTask` replays the launch intent on every resume; a bare
    // `openid-credential-offer://` would push us into the import flow with no
    // payload every cold start.
    expect(parseDeepLink('openid-credential-offer://').kind).toBe('unknown');
    expect(parseDeepLink('openid-credential-offer://?').kind).toBe('unknown');
  });

  it('treats credential-offer URLs without an offer payload as unknown', () => {
    expect(parseDeepLink('openid-credential-offer://?url=exp%3A%2F%2F127.0.0.1').kind).toBe(
      'unknown'
    );
  });

  it('treats an empty openid4vp URL as unknown (stale Android launch intent)', () => {
    expect(parseDeepLink('openid4vp://').kind).toBe('unknown');
    expect(parseDeepLink('openid-vp://?').kind).toBe('unknown');
  });

  it('returns unknown for unrecognised input', () => {
    expect(parseDeepLink('not a url').kind).toBe('unknown');
    expect(parseDeepLink('https://example.com/foo').kind).toBe('unknown');
  });

  it('parses a https://solidarity.gg/#<fragment> Verified Page link', () => {
    const r = parseDeepLink('https://solidarity.gg/#eyJhbGciOiJFUzI1NiJ9');
    expect(r.kind).toBe('verifiedProfile');
    if (r.kind === 'verifiedProfile') {
      expect(r.fragment).toBe('eyJhbGciOiJFUzI1NiJ9');
    }
  });

  it('parses the primary creds.id /name Verified Page link', () => {
    const r = parseDeepLink('https://creds.id/alice#eyJhbGciOiJFUzI1NiJ9');
    expect(r).toEqual({ kind: 'verifiedProfile', fragment: 'eyJhbGciOiJFUzI1NiJ9' });
  });

  it('grants creds.id the full product-host link surface, /c card links included (2026-08-30 switch)', () => {
    expect(parseDeepLink('https://creds.id/c/f47ac10b-58cc-4372-a567-0e02b2c3d479')).toEqual({
      kind: 'card',
      cardId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    });
  });

  it('treats a verified-domain https link with no hash as unknown, not verifiedProfile', () => {
    expect(parseDeepLink('https://solidarity.gg/').kind).toBe('unknown');
    expect(parseDeepLink('https://solidarity.gg').kind).toBe('unknown');
  });

  it('parses product /@handle links for ATProto, explicit DNS, and ENS reads', () => {
    for (const [rawHandle, expectedHandle] of [
      ['@alice.bsky.social', 'alice.bsky.social'],
      ['@dns:example.com', 'dns:example.com'],
      ['@vitalik.eth', 'vitalik.eth'],
    ] as const) {
      const route = parseDeepLink(`https://app.solidarity.gg/${rawHandle}`);
      expect(route.kind).toBe('verifiedHandle');
      if (route.kind === 'verifiedHandle') expect(route.handle).toBe(expectedHandle);
    }
  });

  it('does not route /@handle on a trusted-but-non-product host', () => {
    expect(parseDeepLink('https://github.com/@alice.example').kind).toBe('unknown');
  });

  it('does not let an /@handle path hide a Verified Page hash', () => {
    const npub = 'npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg';
    expect(parseDeepLink(`https://solidarity.gg/@alice.example#nostr:${npub}`)).toEqual({
      kind: 'verifiedPointer',
      npub,
    });
    expect(parseDeepLink('https://solidarity.gg/@alice.example#fragment_blob')).toEqual({
      kind: 'verifiedProfile',
      fragment: 'fragment_blob',
    });
  });

  it('parses a https://solidarity.gg/#nostr:<npub> short-pointer link', () => {
    const npub = 'npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg';
    const r = parseDeepLink(`https://solidarity.gg/#nostr:${npub}`);
    expect(r.kind).toBe('verifiedPointer');
    if (r.kind === 'verifiedPointer') expect(r.npub).toBe(npub);
  });

  it('does not misread a #nostr: prefix with a non-npub tail as a fragment — falls to unknown', () => {
    expect(parseDeepLink('https://solidarity.gg/#nostr:not-an-npub').kind).toBe('unknown');
    expect(parseDeepLink('https://solidarity.gg/#nostr:').kind).toBe('unknown');
    // An overlong tail (DoS guard) is also rejected.
    expect(parseDeepLink(`https://solidarity.gg/#nostr:npub1${'q'.repeat(200)}`).kind).toBe('unknown');
  });

  it('still prefers the /c/<uuid> card route over a Verified Page fragment on the same host', () => {
    const r = parseDeepLink('https://solidarity.gg/c/f47ac10b-58cc-4372-a567-0e02b2c3d479#ignored');
    expect(r.kind).toBe('card');
  });

  it('no longer routes the removed solidarity://pear/<did> link', () => {
    const did = 'did:key:zDnaeuchQNqLi4x1P85fs3QsiMPahCH2snwHU4SaV6MQnan2Q';
    expect(parseDeepLink(`solidarity://pear/${did}`).kind).toBe('unknown');
  });

  // `isVerifiedDomain`/`TRUSTED_HOSTS` also allowlists third-party identity
  // hosts (apple.com/google.com/microsoft.com/github.com/linkedin.com) for a
  // DIFFERENT purpose (OIDC/domain verification). The `card` universal-link
  // route must only fire on OUR OWN product hosts.
  it('does NOT route a card link on a trusted-but-non-product host (github.com)', () => {
    expect(parseDeepLink('https://github.com/c/f47ac10b-58cc-4372-a567-0e02b2c3d479').kind).toBe(
      'unknown'
    );
  });

  it('does NOT route card links on the other allowlisted identity hosts', () => {
    for (const host of ['apple.com', 'google.com', 'microsoft.com', 'linkedin.com']) {
      expect(
        parseDeepLink(`https://${host}/c/f47ac10b-58cc-4372-a567-0e02b2c3d479`).kind
      ).toBe('unknown');
    }
  });

  it('still routes card links on both product hosts', () => {
    for (const host of ['solidarity.gg', 'airmeishi.app']) {
      expect(
        parseDeepLink(`https://${host}/c/f47ac10b-58cc-4372-a567-0e02b2c3d479`).kind
      ).toBe('card');
    }
  });

  // ── webSign (App↔Web per-action signing, research §4 / T4a) ──────────────
  it('parses a solidarity://websign?req=<X> deep link', () => {
    const r = parseDeepLink('solidarity://websign?req=aaa.bbb.ccc');
    expect(r.kind).toBe('webSign');
    if (r.kind === 'webSign') {
      expect(r.request).toBe('aaa.bbb.ccc');
    }
  });

  it('parses a https://<product-host>/websign#req=<X> fragment deep link', () => {
    const r = parseDeepLink('https://solidarity.gg/websign#req=BLOB_VALUE');
    expect(r.kind).toBe('webSign');
    if (r.kind === 'webSign') {
      expect(r.request).toBe('BLOB_VALUE');
    }
  });

  it('treats a websign wrapper with no req as unknown', () => {
    expect(parseDeepLink('solidarity://websign').kind).toBe('unknown');
    expect(parseDeepLink('https://solidarity.gg/websign').kind).toBe('unknown');
  });

  it('does not confuse a real Verified Page fragment link with a websign link', () => {
    // No `/websign` path segment → still routes as a Verified Page fragment.
    expect(parseDeepLink('https://solidarity.gg/#abc123').kind).toBe('verifiedProfile');
  });
});

describe('creds.id production product host (05-spec §8-B, switched 2026-08-30)', () => {
  const CREDS_HANDLE_URL = 'https://creds.id/@alice.bsky.social';
  const CREDS_FRAGMENT_URL = 'https://creds.id/#nostr:npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqql6verd';

  it('treats creds.id as a product host WITHOUT dev mode (production default)', () => {
    const r = parseDeepLink(CREDS_HANDLE_URL);
    expect(r.kind).toBe('verifiedHandle');
    if (r.kind === 'verifiedHandle') expect(r.handle).toBe('alice.bsky.social');
  });

  it('keeps the legacy app.solidarity.gg handle links routing (pre-switch shares)', () => {
    const r = parseDeepLink('https://app.solidarity.gg/@alice.bsky.social');
    expect(r.kind).toBe('verifiedHandle');
    if (r.kind === 'verifiedHandle') expect(r.handle).toBe('alice.bsky.social');
  });

  it('routes a creds.id pointer fragment (self-verifying form)', () => {
    expect(parseDeepLink(CREDS_FRAGMENT_URL).kind).toBe('verifiedPointer');
  });

  it('never admits third-party TRUSTED_HOSTS even with devProductHosts on', () => {
    expect(parseDeepLink('https://github.com/@alice.bsky.social', { devProductHosts: true }).kind).toBe('unknown');
    expect(
      parseDeepLink('https://github.com/c/f47ac10b-58cc-4372-a567-0e02b2c3d479', { devProductHosts: true }).kind
    ).toBe('unknown');
  });
});

// docs/ref/15 P1: a bare creds.id name reads as the same Page as `/@name`, on
// creds.id only; site words and other shapes stay web pages (`unknown`).
describe('bare creds.id names', () => {
  it.each([
    ['https://creds.id/gimmy', 'gimmy'],
    ['https://creds.id/Gimmy', 'gimmy'],
    ['https://creds.id/gimmy?ref=x', 'gimmy'],
  ])('%s → %s', (url, handle) => {
    expect(parseDeepLink(url)).toEqual({ kind: 'verifiedHandle', handle });
  });

  it.each([
    'https://creds.id/edit',
    'https://creds.id/admin',
    'https://creds.id/gimmy/',
    'https://creds.id/gi',
    'https://creds.id/%E0%A4%A',
    'https://www.creds.id/gimmy',
    'https://solidarity.gg/gimmy',
  ])('%s → unknown', (url) => {
    expect(parseDeepLink(url).kind).toBe('unknown');
  });

  it('keeps an offline Page link on its fragment', () => {
    expect(parseDeepLink('https://creds.id/gimmy#abc123').kind).toBe('verifiedProfile');
  });
});
