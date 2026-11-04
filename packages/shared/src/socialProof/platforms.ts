/**
 * Platform rules (docs/ref/10 §3.9, §3.11) — which public page shows a
 * handle's owner field, and the exact markup around it. One table drives
 * every checker: the owner's phone, a viewer's phone and the Pro notary all
 * read the page themselves and accept the marker only inside that field, so a
 * marker pasted into someone else's reply, README or pinned post never counts.
 * Markup changes on a platform make checks fail closed, never pass.
 */

export type ProofPlatform = 'x' | 'x-link' | 'x-profile' | 'telegram' | 'github' | 'website';

export interface PlatformRule {
  readonly handlePattern: RegExp;
  readonly host: (handle: string) => string;
  readonly path: (handle: string) => string;
  /**
   * Owner-controlled field; `null` = the marker may sit anywhere on the page (websites).
   * `stopUnescaped`: the field is a JS string literal, so it ends at the first `stop`
   * byte that is not backslash-escaped.
   */
  readonly field:
    | ((handle: string) => { readonly start: string; readonly stop: string; readonly stopUnescaped?: true })
    | null;
}

export const PROOF_PLATFORMS: Readonly<Record<ProofPlatform, PlatformRule>> = {
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
  // The whole homepage is owner-controlled, so the marker may sit anywhere on it.
  website: {
    handlePattern: /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u,
    host: (h) => h,
    path: () => '/',
    field: null,
  },
};

/** Hosts a "website" proof may never target — they have their own rules or are ours. */
const RESERVED_WEBSITE_HOSTS = new Set(['x.com', 'twitter.com', 't.co', 't.me', 'github.com', 'creds.id']);

export function isAllowedWebsiteHost(host: string): boolean {
  if (!PROOF_PLATFORMS.website.handlePattern.test(host)) return false;
  for (const reserved of RESERVED_WEBSITE_HOSTS) {
    if (host === reserved || host.endsWith(`.${reserved}`)) return false;
  }
  return !host.endsWith('.localhost') && !host.endsWith('.local') && !host.endsWith('.internal');
}

const MARKER_HOST = 'creds.id/';
const NAME_CHAR = /[a-z0-9_-]/iu;

/** The name ends at `i`: no name character follows, nor `.` or `/` plus one (`alice.eth`, `alice/foo`). */
function nameEndsAt(text: string, i: number): boolean {
  const next = text.charAt(i);
  if (NAME_CHAR.test(next)) return false;
  return !((next === '.' || next === '/') && NAME_CHAR.test(text.charAt(i + 1)));
}

/** True when `text` names `creds.id/<name>` or `creds.id/@<name>` exactly (not `namex`, `name.eth`, `notcreds.id`). */
export function bioCarriesMarker(text: string, name: string): boolean {
  return [`${MARKER_HOST}@${name}`, `${MARKER_HOST}${name}`].some((needle) => {
    for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) {
      const before = at === 0 ? '' : text.charAt(at - 1);
      if (!/[a-z0-9.-]/iu.test(before) && nameEndsAt(text, at + needle.length)) return true;
    }
    return false;
  });
}
