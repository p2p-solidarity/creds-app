import { describe, expect, it } from 'bun:test';

import {
  createPublicPageFetch,
  MAX_PUBLIC_PAGE_BYTES,
  MAX_PUBLIC_PAGE_REDIRECTS,
  type ManualRedirectFetch,
} from '../../src/profile/httpsOwnership';

type Reply = Response | ((url: string) => Response);

/** A fetch fake that records every URL the phone would have connected to. */
function fakeFetch(replies: Record<string, Reply>) {
  const calls: { url: string; redirect: string }[] = [];
  const impl: ManualRedirectFetch = async (url, init) => {
    calls.push({ url, redirect: init.redirect });
    const reply = replies[url];
    if (reply === undefined) throw new Error(`unexpected fetch ${url}`);
    return typeof reply === 'function' ? reply(url) : reply;
  };
  return { calls, impl };
}

const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });

describe('createPublicPageFetch', () => {
  it('fetches a public https page with native redirect-following off', async () => {
    const { calls, impl } = fakeFetch({ 'https://kidney.dev/': new Response('<p>creds.id/@kid</p>') });
    const res = await createPublicPageFetch(impl)('https://kidney.dev/');
    expect(res).toEqual({ ok: true, value: { status: 200, body: '<p>creds.id/@kid</p>' } });
    expect(calls).toEqual([{ url: 'https://kidney.dev/', redirect: 'manual' }]);
  });

  it('reports a non-200 status without reading the body', async () => {
    const { impl } = fakeFetch({ 'https://kidney.dev/': new Response('gone', { status: 404 }) });
    expect(await createPublicPageFetch(impl)('https://kidney.dev/')).toEqual({ ok: true, value: { status: 404, body: '' } });
  });

  it.each([
    'http://kidney.dev/',
    'https://10.0.0.1/',
    'https://192.168.1.1/',
    'https://172.16.0.5/',
    'https://127.0.0.1/',
    'https://169.254.169.254/',
    'https://0.0.0.0/',
    'https://2130706433/',
    'https://0x7f.1/',
    'https://100.64.0.1/',
    'https://localhost/',
    'https://localhost./',
    'https://router.localhost/',
    'https://[::1]/',
    'https://user:pass@kidney.dev/',
    'not a url',
  ])('never connects to %s', async (url) => {
    const { calls, impl } = fakeFetch({});
    expect(await createPublicPageFetch(impl)(url)).toEqual({ ok: false, error: 'network' });
    expect(calls).toEqual([]);
  });

  it('follows a redirect to another public https page, checking the hop', async () => {
    const { calls, impl } = fakeFetch({
      'https://kidney.dev/': redirect('/about'),
      'https://kidney.dev/about': redirect('https://www.kidney.dev/about', 301),
      'https://www.kidney.dev/about': new Response('page'),
    });
    expect(await createPublicPageFetch(impl)('https://kidney.dev/')).toEqual({ ok: true, value: { status: 200, body: 'page' } });
    expect(calls.map((c) => c.url)).toEqual(['https://kidney.dev/', 'https://kidney.dev/about', 'https://www.kidney.dev/about']);
    expect(calls.every((c) => c.redirect === 'manual')).toBe(true);
  });

  it.each([
    'http://kidney.dev/',
    'https://10.0.0.1/admin',
    'https://192.168.0.1/',
    'https://127.0.0.1:8080/',
    'https://localhost/',
    'https://[fd00::1]/',
  ])('refuses a redirect to %s without connecting to it', async (location) => {
    const { calls, impl } = fakeFetch({ 'https://evil.example/': redirect(location) });
    const res = await createPublicPageFetch(impl)('https://evil.example/');
    expect(res).toEqual({ ok: true, value: { status: 302, body: '' } });
    expect(calls.map((c) => c.url)).toEqual(['https://evil.example/']);
  });

  it('stops after the redirect cap', async () => {
    const { calls, impl } = fakeFetch({ 'https://loop.example/': redirect('https://loop.example/') });
    const res = await createPublicPageFetch(impl)('https://loop.example/');
    expect(res).toEqual({ ok: true, value: { status: 302, body: '' } });
    expect(calls.length).toBe(MAX_PUBLIC_PAGE_REDIRECTS + 1);
  });

  it('treats a redirect without Location as the final status', async () => {
    const { impl } = fakeFetch({ 'https://kidney.dev/': new Response(null, { status: 302 }) });
    expect(await createPublicPageFetch(impl)('https://kidney.dev/')).toEqual({ ok: true, value: { status: 302, body: '' } });
  });

  it('rejects a response the transport followed somewhere else on its own', async () => {
    const followed = new Response('router admin');
    Object.defineProperty(followed, 'url', { value: 'https://192.168.1.1/' });
    const { impl } = fakeFetch({ 'https://kidney.dev/': followed });
    expect(await createPublicPageFetch(impl)('https://kidney.dev/')).toEqual({ ok: false, error: 'network' });
  });

  it('rejects a declared length over the cap without reading the body', async () => {
    let pulled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulled = true;
          controller.enqueue(new Uint8Array(1));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const { impl } = fakeFetch({
      'https://kidney.dev/': new Response(body, { headers: { 'content-length': String(MAX_PUBLIC_PAGE_BYTES + 1) } }),
    });
    expect(await createPublicPageFetch(impl)('https://kidney.dev/')).toEqual({ ok: false, error: 'network' });
    expect(pulled).toBe(false);
  });

  it('stops reading a streamed body once it passes the cap', async () => {
    const chunk = new Uint8Array(256 * 1024);
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const { impl } = fakeFetch({ 'https://kidney.dev/': new Response(body) });
    expect(await createPublicPageFetch(impl)('https://kidney.dev/')).toEqual({ ok: false, error: 'network' });
    expect(pulled).toBeLessThanOrEqual(MAX_PUBLIC_PAGE_BYTES + 2 * chunk.byteLength);
  });

  it('maps a transport error to network', async () => {
    const impl: ManualRedirectFetch = async () => {
      throw new TypeError('offline');
    };
    expect(await createPublicPageFetch(impl)('https://kidney.dev/')).toEqual({ ok: false, error: 'network' });
  });
});
