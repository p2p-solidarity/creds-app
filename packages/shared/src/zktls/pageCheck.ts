/**
 * Local page check (docs/ref/10 §3.11 tiers 3–4): the owner's phone, a
 * viewer's phone, or the Pro notary fetches a public profile itself and checks
 * the owner's own field for `creds.id/@<name>` with the same platform rules
 * the notary evidence used. No TLS transcript: the trust comes from who
 * fetched (a device-attested app, or the reader's own phone), not from the
 * fetch itself.
 */
import { err, ok, type Result } from '../types/result';
import type { SocialTarget } from './links';
import { bioCarriesMarker, ZKTLS_PLATFORMS } from './platforms';
import type { ZktlsSocialPlatform } from './socialProof';
import { isMarkerUrl, parseXProfile } from './xProfile';

/** Fetch a page as text, following redirects. Injected: app, notary and tests fetch differently. */
export type PageFetch = (url: string) => Promise<Result<{ readonly status: number; readonly body: string }, 'network'>>;

export type MarkerCheckFailure = 'notFound' | 'blocked' | 'markerMissing' | 'network';

/** X rewrites bio URLs to t.co; follow at most this many. */
const MAX_TCO_HOPS = 3;
const TCO_RE = /(?:^|[^a-z0-9.-])t\.co\/([A-Za-z0-9]{6,15})(?![A-Za-z0-9])/giu;

/** Every value of a `start…stop` owner field in `body` (GitHub has one per social link). */
function fieldValues(body: string, start: string, stop: string): string[] {
  const out: string[] = [];
  for (let at = body.indexOf(start); at >= 0; at = body.indexOf(start, at + 1)) {
    const from = at + start.length;
    const end = body.indexOf(stop, from);
    if (end >= 0) out.push(body.slice(from, end));
  }
  return out;
}

/** X's embedded profile: the anchor through the end of its JS string literal. */
function xProfilePayload(body: string, handle: string): string | null {
  const rule = ZKTLS_PLATFORMS['x-profile'].field?.(handle);
  if (rule === undefined) return null;
  const at = body.indexOf(rule.start);
  if (at < 0) return null;
  for (let i = at + rule.start.length; i < body.length; i++) {
    if (body.charAt(i) === '\\') i++;
    else if (body.charAt(i) === rule.stop) return body.slice(at, i);
  }
  return null;
}

/**
 * Does this page's owner field carry the marker? For X without its embedded
 * profile the answer needs the bio's t.co hops, returned for the caller to fetch.
 */
export function markerInPage(
  platform: ZktlsSocialPlatform,
  handle: string,
  name: string,
  body: string,
): 'found' | 'missing' | { readonly tco: readonly string[] } {
  const verdict = (hit: boolean) => (hit ? 'found' : 'missing');
  switch (platform) {
    case 'website':
      return verdict(bioCarriesMarker(body, name));
    case 'telegram':
    case 'github': {
      const field = ZKTLS_PLATFORMS[platform].field?.(handle);
      return verdict(field !== undefined && fieldValues(body, field.start, field.stop).some((v) => bioCarriesMarker(v, name)));
    }
    case 'x': {
      const payload = xProfilePayload(body, handle);
      if (payload !== null) {
        const urls = parseXProfile(payload, handle);
        return verdict(urls.ok && urls.value.some((u) => isMarkerUrl(u, name)));
      }
      const field = ZKTLS_PLATFORMS.x.field?.(handle);
      const bio = field === undefined ? [] : fieldValues(body, field.start, field.stop);
      const ids = [...new Set(bio.flatMap((b) => [...b.matchAll(TCO_RE)].map((m) => m[1] ?? '')).filter((id) => id !== ''))];
      return ids.length === 0 ? 'missing' : { tco: ids.slice(0, MAX_TCO_HOPS) };
    }
  }
}

function pageUrl(platform: 'x' | 'x-link' | ZktlsSocialPlatform, handle: string): string {
  const rule = ZKTLS_PLATFORMS[platform];
  return `https://${rule.host(handle)}${rule.path(handle)}`;
}

async function fetchOwnerPage(
  fetchPage: PageFetch,
  url: string,
): Promise<Result<string, MarkerCheckFailure>> {
  const res = await fetchPage(url);
  if (!res.ok) return err('network');
  if (res.value.status === 404) return err('notFound');
  if (res.value.status !== 200) return err('blocked');
  return ok(res.value.body);
}

/** Fetch the target's public page (and X's t.co hops) and check the marker. */
export async function checkSocialMarker(
  target: SocialTarget,
  name: string,
  fetchPage: PageFetch,
): Promise<Result<void, MarkerCheckFailure>> {
  const rule = ZKTLS_PLATFORMS[target.platform];
  if (!rule.handlePattern.test(target.handle)) return err('notFound');
  const body = await fetchOwnerPage(fetchPage, pageUrl(target.platform, target.handle));
  if (!body.ok) return body;

  const found = markerInPage(target.platform, target.handle, name, body.value);
  if (found === 'found') return ok(undefined);
  if (found === 'missing') return err('markerMissing');

  const titleField = ZKTLS_PLATFORMS['x-link'].field?.('');
  const hops = await Promise.all(found.tco.map((id) => fetchOwnerPage(fetchPage, pageUrl('x-link', id))));
  for (const hop of hops) {
    if (hop.ok && titleField !== undefined && fieldValues(hop.value, titleField.start, titleField.stop).some((t) => bioCarriesMarker(t, name))) {
      return ok(undefined);
    }
  }
  const failed = hops.find((h) => !h.ok && h.error === 'network');
  return failed !== undefined && !failed.ok ? err(failed.error) : err('markerMissing');
}
