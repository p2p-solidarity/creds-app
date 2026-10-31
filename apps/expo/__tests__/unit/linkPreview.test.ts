/**
 * Link preview: the HTML of a link's page is someone else's input, and every
 * URL it names becomes an image the app loads. Failure modes:
 *  - a relative og:image / icon must resolve against the page, not the app
 *  - http, data:, javascript:, localhost or private-IP image URLs are dropped
 *  - attribute order / quote style / HTML entities must not change the result
 *  - an og:image inside a comment or script is not the page's image
 *  - a plain website's og:image is a thumbnail, never offered as an avatar
 *  - a page with nothing usable still yields the origin favicon
 *  - GitHub avatars come from the handle, without fetching the page
 *  - fetch failure or a non-200 page is an error, never a guessed avatar
 */
import { describe, expect, it } from 'bun:test';

import { err, ok, type PageFetch } from '@solidarity/shared';

import { fetchLinkPreview, parseLinkPreview } from '../../src/profile/linkPreview';

const page = (html: string): PageFetch => async () => ok({ status: 200, body: html });

describe('parseLinkPreview', () => {
  it('resolves relative og:image and icon against the page', () => {
    const html = '<head><meta property="og:image" content="/me.jpg"><link rel="apple-touch-icon" href="icon.png"></head>';
    const preview = parseLinkPreview(html, 'https://t.me/alice');
    expect(preview.avatar).toBe('https://t.me/me.jpg');
    expect(preview.icon).toBe('https://t.me/icon.png');
  });

  it('drops insecure and private image URLs', () => {
    for (const bad of ['http://t.me/a.jpg', 'data:image/png;base64,AAAA', 'javascript:alert(1)', 'https://localhost/a.png', 'https://10.0.0.2/a.png', 'https://[::1]/a.png']) {
      const preview = parseLinkPreview(`<meta property="og:image" content="${bad}"><link rel="icon" href="${bad}">`, 'https://t.me/alice');
      expect(preview.avatar).toBeNull();
      expect(preview.icon).toBe('https://t.me/favicon.ico');
    }
  });

  it('reads content-before-property, single quotes and entities', () => {
    const html = "<meta content='https://cdn.example.com/a.jpg?w=1&amp;h=2' property='og:image'>";
    expect(parseLinkPreview(html, 'https://x.com/alice').avatar).toBe('https://cdn.example.com/a.jpg?w=1&h=2');
  });

  it('ignores tags inside comments and scripts', () => {
    const html = '<!-- <meta property="og:image" content="https://evil.example/a.jpg"> --><script>"<meta property=\\"og:image\\" content=\\"https://evil.example/b.jpg\\">"</script>';
    expect(parseLinkPreview(html, 'https://x.com/alice').avatar).toBeNull();
  });

  it('never offers a plain website og:image as an avatar', () => {
    const preview = parseLinkPreview('<meta property="og:image" content="https://blog.example/cover.jpg">', 'https://blog.example/post');
    expect(preview.avatar).toBeNull();
    expect(preview.image).toBe('https://blog.example/cover.jpg');
  });

  it('falls back to the origin favicon', () => {
    expect(parseLinkPreview('<html></html>', 'https://blog.example/a/b').icon).toBe('https://blog.example/favicon.ico');
  });
});

describe('fetchLinkPreview', () => {
  it('builds a GitHub avatar from the handle without fetching', async () => {
    let fetched = false;
    const result = await fetchLinkPreview('https://github.com/kidneyweakx', async () => {
      fetched = true;
      return err('network');
    });
    expect(fetched).toBe(false);
    expect(result).toEqual(ok({ icon: 'https://github.com/favicon.ico', image: null, avatar: 'https://github.com/kidneyweakx.png' }));
  });

  it('reports a failed or non-200 fetch as an error', async () => {
    expect(await fetchLinkPreview('https://t.me/alice', async () => err('network'))).toEqual(err('unreachable'));
    expect(await fetchLinkPreview('https://t.me/alice', async () => ok({ status: 404, body: '' }))).toEqual(err('unreachable'));
  });

  it('refuses a non-https link before fetching', async () => {
    expect(await fetchLinkPreview('http://t.me/alice', page(''))).toEqual(err('unreachable'));
  });

  it('returns the parsed preview of a social page', async () => {
    const result = await fetchLinkPreview('https://t.me/alice', page('<meta property="og:image" content="https://cdn4.telesco.pe/a.jpg">'));
    expect(result).toEqual(ok({ icon: 'https://t.me/favicon.ico', image: 'https://cdn4.telesco.pe/a.jpg', avatar: 'https://cdn4.telesco.pe/a.jpg' }));
  });
});
