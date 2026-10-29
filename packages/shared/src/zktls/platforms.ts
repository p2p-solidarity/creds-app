/**
 * zkTLS platform rules (docs/ref/10 §3.9) — which public page proves a
 * handle, and which owner-controlled field of that page the prover reveals.
 *
 * One table drives all three parties: the app prover builds the request and
 * picks the reveal range from it, the notary refuses any session outside it,
 * and verifiers re-check the revealed bytes against it. A rule's `field` is
 * the exact markup that opens the owner-controlled value; the revealed bytes
 * must start there and stop before `stop`, so a marker pasted into someone
 * else's reply, README or pinned post can never stand in for the owner's own
 * field. Markup changes on a platform make proofs fail closed, never pass.
 */
import { err, ok, type Result } from '../types/result';

export type ZktlsPlatform = 'x' | 'x-link' | 'x-profile' | 'telegram' | 'github' | 'website' | 'creds-name';

export interface PlatformRule {
  readonly handlePattern: RegExp;
  readonly host: (handle: string) => string;
  readonly path: (handle: string) => string;
  /**
   * Owner-controlled field; `null` = the revealed bytes are the marker alone (websites).
   * `stopUnescaped`: the field is a JS string literal, so it ends at the first `stop`
   * byte that is not backslash-escaped.
   */
  readonly field:
    | ((handle: string) => { readonly start: string; readonly stop: string; readonly stopUnescaped?: true })
    | null;
}

export const ZKTLS_PLATFORMS: Readonly<Record<ZktlsPlatform, PlatformRule>> = {
  // Logged-out x.com serves the bio as the description meta tag; URLs in it are t.co links.
  x: {
    handlePattern: /^[A-Za-z0-9_]{1,15}$/u,
    host: () => 'x.com',
    path: (h) => `/${h}`,
    field: () => ({ start: '<meta name="description" content="', stop: '"' }),
  },
  // A t.co page names its destination in <title>; links an X bio to creds.id/@name.
  'x-link': {
    handlePattern: /^[A-Za-z0-9]{6,15}$/u,
    host: () => 't.co',
    path: (h) => `/${h}`,
    field: () => ({ start: '<title>', stop: '<' }),
  },
  // Logged-out x.com also embeds its own GraphQL profile as a JS string; it names the
  // account (`core.screen_name`) and carries the bio links and the website field
  // already expanded, so one witness covers both (docs/ref/10 §3.10). Checked by
  // parsing the whole payload (`xProfile.ts`), not by byte pattern.
  'x-profile': {
    handlePattern: /^[A-Za-z0-9_]{1,15}$/u,
    host: () => 'x.com',
    path: (h) => `/${h}`,
    field: () => ({ start: '{\\"data\\":{\\"user_result_by_screen_name\\":', stop: '"', stopUnescaped: true }),
  },
  telegram: {
    handlePattern: /^[A-Za-z0-9_]{5,32}$/u,
    host: () => 't.me',
    path: (h) => `/${h}`,
    field: () => ({ start: '<meta property="og:description" content="', stop: '"' }),
  },
  // Profile social links render with rel="nofollow me"; README links never carry "me".
  github: {
    handlePattern: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u,
    host: () => 'github.com',
    path: (h) => `/${h}`,
    field: () => ({ start: 'rel="nofollow me" class="Link--primary wb-break-all" href="', stop: '"' }),
  },
  // The whole homepage is owner-controlled, so the marker alone is revealed.
  website: {
    handlePattern: /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u,
    host: (h) => h,
    path: () => '/',
    field: null,
  },
  // creds.id's NIP-05 directory: proves name → npub at proof time (grill Q4).
  'creds-name': {
    handlePattern: /^[a-z0-9]{3,30}$/u,
    host: () => 'creds.id',
    path: (h) => `/.well-known/nostr.json?name=${h}`,
    field: (h) => ({ start: `"names":{"${h}":"`, stop: '"' }),
  },
};

/** Hosts a "website" proof may never target — they have their own rules or are ours. */
const RESERVED_WEBSITE_HOSTS = new Set(['x.com', 'twitter.com', 't.co', 't.me', 'github.com', 'creds.id']);

export function isAllowedWebsiteHost(host: string): boolean {
  if (!ZKTLS_PLATFORMS.website.handlePattern.test(host)) return false;
  for (const reserved of RESERVED_WEBSITE_HOSTS) {
    if (host === reserved || host.endsWith(`.${reserved}`)) return false;
  }
  return !host.endsWith('.localhost') && !host.endsWith('.local') && !host.endsWith('.internal');
}

export function isZktlsPlatform(value: unknown): value is ZktlsPlatform {
  return typeof value === 'string' && Object.hasOwn(ZKTLS_PLATFORMS, value);
}

export function requestLineFor(platform: ZktlsPlatform, handle: string): string {
  return `GET ${ZKTLS_PLATFORMS[platform].path(handle)} HTTP/1.1`;
}

/** The only page a proof for `handle` may fetch: its host and exact request line. */
export function profileTarget(
  platform: ZktlsPlatform,
  handle: string,
): Result<{ readonly server: string; readonly request: string }, string> {
  const rule = ZKTLS_PLATFORMS[platform];
  if (!rule.handlePattern.test(handle)) return err('handle does not match the platform pattern');
  if (platform === 'website' && !isAllowedWebsiteHost(handle)) return err('website host is not allowed');
  return ok({ server: rule.host(handle), request: requestLineFor(platform, handle) });
}

const MARKER_DOMAIN = 'creds.id/@';

/** True when `text` names `creds.id/@<name>` exactly (not `@namex`, not `notcreds.id`). */
export function bioCarriesMarker(text: string, name: string): boolean {
  const needle = `${MARKER_DOMAIN}${name}`;
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at < 0) return false;
    const before = at === 0 ? '' : text.charAt(at - 1);
    const after = text.charAt(at + needle.length);
    if (!/[a-z0-9.-]/iu.test(before) && !/[a-z0-9_]/iu.test(after)) return true;
    from = at + 1;
  }
}
