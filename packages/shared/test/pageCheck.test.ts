/**
 * Local page check (docs/ref/10 §3.11 tiers 3–4): a phone (or the Pro notary)
 * fetches a public profile itself and decides whether the owner's own field
 * names `creds.id/@<name>`. Failure modes, each must NOT pass:
 *   - the marker names another creds.id name (prefix/suffix lookalike)
 *   - X's embedded profile is for another account
 *   - the marker sits outside the owner field (README, reply, page body)
 *   - X without the embedded profile: a bio t.co link that leads elsewhere
 *   - the platform answers 404 / a block, or the fetch fails
 * Real page excerpts in fixtures/pages (fetched 2026-10-30).
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ok, type Result } from '../src/types/result';
import { checkSocialMarker, markerInPage, type PageFetch } from '../src/zktls';

const page = (file: string) => readFileSync(join(import.meta.dir, 'fixtures/pages', file), 'utf8');
const X = page('x-kidneyweakx.html');
const GITHUB = page('github-kidneyweakx.html');
const TELEGRAM = page('telegram-durov.html');

describe('markerInPage', () => {
  test('X embedded profile carrying creds.id/@kidneyx passes', () => {
    expect(markerInPage('x', 'kidneyweakx', 'kidneyx', X)).toBe('found');
    expect(markerInPage('x', 'KidneyWeakX', 'kidneyx', X)).toBe('found');
  });

  test('a lookalike name does not pass', () => {
    expect(markerInPage('x', 'kidneyweakx', 'kidney', X)).toBe('missing');
    expect(markerInPage('x', 'kidneyweakx', 'kidneyxx', X)).toBe('missing');
  });

  test('X embedded profile for another account does not pass', () => {
    expect(markerInPage('x', 'elonmusk', 'kidneyx', X)).toBe('missing');
  });

  test('X page without the embedded profile asks for the bio t.co hops', () => {
    const metaOnly = X.slice(0, X.indexOf('<script>'));
    expect(markerInPage('x', 'kidneyweakx', 'kidneyx', metaOnly)).toEqual({ tco: ['LMq1r8CC5c'] });
  });

  test('GitHub counts only rel="me" social links', () => {
    expect(markerInPage('github', 'kidneyweakx', 'kidneyx', GITHUB)).toBe('missing');
    const marked = GITHUB.replace('https://kidneyweakx.com/"', 'https://creds.id/@kidneyx"');
    expect(markerInPage('github', 'kidneyweakx', 'kidneyx', marked)).toBe('found');
    const readme = `${GITHUB}<article><a href="https://creds.id/@kidneyx">creds.id/@kidneyx</a></article>`;
    expect(markerInPage('github', 'kidneyweakx', 'kidneyx', readme)).toBe('missing');
  });

  test('Telegram counts only the bio (og:description)', () => {
    expect(markerInPage('telegram', 'durov', 'kidneyx', TELEGRAM)).toBe('missing');
    expect(markerInPage('telegram', 'durov', 'kidneyx', TELEGRAM.replace('Founder of Telegram.', 'creds.id/@kidneyx'))).toBe('found');
    expect(markerInPage('telegram', 'durov', 'kidneyx', `${TELEGRAM}<p>creds.id/@kidneyx</p>`)).toBe('missing');
  });

  test('a website homepage counts anywhere on the page', () => {
    expect(markerInPage('website', 'kidneyweakx.com', 'kidneyx', '<footer>creds.id/@kidneyx</footer>')).toBe('found');
    expect(markerInPage('website', 'kidneyweakx.com', 'kidneyx', '<footer>notcreds.id/@kidneyx</footer>')).toBe('missing');
  });
});

describe('checkSocialMarker', () => {
  const fetcher =
    (pages: Record<string, Result<{ status: number; body: string }, 'network'>>): PageFetch =>
    async (url) =>
      pages[url] ?? ok({ status: 404, body: '' });

  test('X passes from the embedded profile with one fetch', async () => {
    const r = await checkSocialMarker({ platform: 'x', handle: 'kidneyweakx' }, 'kidneyx', fetcher({ 'https://x.com/kidneyweakx': ok({ status: 200, body: X }) }));
    expect(r).toEqual({ ok: true, value: undefined });
  });

  test('X without the embedded profile follows the bio t.co link', async () => {
    const metaOnly = X.slice(0, X.indexOf('<script>'));
    const pages = {
      'https://x.com/kidneyweakx': ok({ status: 200, body: metaOnly }),
      'https://t.co/LMq1r8CC5c': ok({ status: 200, body: '<head><title>https://creds.id/@kidneyx</title>' }),
    };
    expect((await checkSocialMarker({ platform: 'x', handle: 'kidneyweakx' }, 'kidneyx', fetcher(pages))).ok).toBe(true);
    pages['https://t.co/LMq1r8CC5c'] = ok({ status: 200, body: '<head><title>https://example.com/</title>' });
    expect(await checkSocialMarker({ platform: 'x', handle: 'kidneyweakx' }, 'kidneyx', fetcher(pages))).toEqual({ ok: false, error: 'markerMissing' });
  });

  test('a 404, a block and a dead network are told apart', async () => {
    const target = { platform: 'github', handle: 'kidneyweakx' } as const;
    expect(await checkSocialMarker(target, 'kidneyx', fetcher({}))).toEqual({ ok: false, error: 'notFound' });
    expect(await checkSocialMarker(target, 'kidneyx', fetcher({ 'https://github.com/kidneyweakx': ok({ status: 429, body: '' }) }))).toEqual({ ok: false, error: 'blocked' });
    expect(await checkSocialMarker(target, 'kidneyx', fetcher({ 'https://github.com/kidneyweakx': { ok: false, error: 'network' } }))).toEqual({ ok: false, error: 'network' });
  });
});

/**
 * X embeds its own GraphQL profile as a JS string (JSON escaped once more).
 * Ported from the notary-era evidence tests: the same attacks must fail when
 * a phone reads the page itself.
 */
type XUrls = readonly { expanded_url: string; display_url?: string }[];
function xPage(p: { screenName?: string; bioUrls?: XUrls; siteUrls?: XUrls; extra?: Record<string, unknown> } = {}): string {
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
  return `<script>window.x={value:"${JSON.stringify(json).slice(1, -1)}"}</script>`;
}

describe('X embedded profile', () => {
  test('the marker as a bio link or in the website field passes', () => {
    expect(markerInPage('x', 'alice', 'alice', xPage({ bioUrls: [{ expanded_url: 'https://creds.id/@alice' }] }))).toBe('found');
    expect(markerInPage('x', 'alice', 'alice', xPage({ siteUrls: [{ expanded_url: 'http://creds.id/@alice' }] }))).toBe('found');
    expect(markerInPage('x', 'alice', 'alice', xPage({ screenName: 'Alice', siteUrls: [{ expanded_url: 'https://www.creds.id/@alice/' }] }))).toBe('found');
  });

  test('another name, a look-alike host or a longer path does not', () => {
    for (const url of ['https://creds.id/@alicex', 'https://notcreds.id/@alice', 'https://creds.id.evil.com/@alice', 'https://creds.id/@alice/x', 'creds.id/@alice']) {
      expect(markerInPage('x', 'alice', 'alice', xPage({ siteUrls: [{ expanded_url: url }] }))).toBe('missing');
    }
  });

  test('a link whose shown text is the marker but leads elsewhere does not', () => {
    expect(markerInPage('x', 'alice', 'alice', xPage({ siteUrls: [{ expanded_url: 'https://evil.example', display_url: 'creds.id/@alice' }] }))).toBe('missing');
  });

  test('the marker outside the bio links and website field does not', () => {
    const pinned = { legacy: { pinned_tweet: { entities: { urls: [{ expanded_url: 'https://creds.id/@alice' }] } } } };
    expect(markerInPage('x', 'alice', 'alice', xPage({ extra: pinned }))).toBe('missing');
  });
});
