/**
 * What one top-level creds.id path segment is. Every reader of creds.id URLs
 * (web route, link previews, app deep links and scanner) asks this, and the
 * NIP-05 directory refuses to issue `RESERVED_NAMES`, so a name and a site
 * page can never claim the same path. Design: airmeishi docs/ref/15.
 *
 * No imports: the directory Worker loads this file on its own.
 */

/** A creds.id name. Anything else (dots, hyphens, 1–2 or 31+ chars) is never a name, so the site owns it. */
export const CREDS_NAME_RE = /^[a-z0-9]{3,30}$/u;

/**
 * Name-shaped words never issued as names. A new name-shaped top-level path
 * goes in here, and the directory is deployed, before the page ships — a name
 * already issued is never taken back. Groups and reasons: docs/ref/15 §3.
 */
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  // Paths the site, app links and workers use today.
  'app', 'edit', 'privacy', 'terms', 'websign', 'pear', 'vault', 'pro', 'api', 'assets', 'index',
  // Likely future site pages and product words.
  'account', 'accounts', 'login', 'logout', 'signin', 'signout', 'signup', 'register', 'settings',
  'profile', 'profiles', 'about', 'docs', 'faq', 'blog', 'download', 'downloads', 'pricing', 'upgrade',
  'status', 'search', 'explore', 'new', 'create', 'claim', 'share', 'scan', 'check', 'present', 'people',
  'contacts', 'card', 'cards', 'page', 'pages', 'link', 'links', 'embed', 'widget', 'home', 'dashboard',
  'inbox', 'notary', 'witness', 'witnesses', 'badge', 'badges', 'proof', 'proofs', 'passport', 'passkey',
  'passkeys', 'recover', 'recovery', 'backup', 'restore', 'delete', 'oauth', 'auth', 'callback', 'sso',
  'license', 'licenses', 'cookies', 'policy', 'policies', 'contact', 'feedback', 'report', 'dmca',
  'copyright', 'careers', 'jobs', 'press', 'brand', 'community', 'developer', 'developers', 'sdk',
  'static', 'media', 'images', 'files', 'uploads', 'cdn', 'sitemap', 'robots', 'favicon', 'manifest',
  'rss', 'feed', 'webhook', 'webhooks', 'graphql', 'relay', 'relays', 'nip05', 'did', 'lnurl', 'ios',
  'android', 'user', 'users', 'wallet', 'attest', 'attestation',
  // Trust and impersonation.
  'admin', 'administrator', 'root', 'system', 'official', 'verified', 'verification', 'verify',
  'security', 'abuse', 'support', 'help', 'helpdesk', 'moderator', 'mod', 'staff', 'team', 'bot',
  'solidarity', 'solidaritygg', 'airmeishi', 'creds', 'credsid', 'credentials', 'nostr', 'legal',
  'billing', 'pay', 'payment', 'invoice',
  // Mailbox and DNS names: `name@creds.id` reads as an email address, and CAs
  // validate a domain through admin@, administrator@, webmaster@, hostmaster@ and postmaster@.
  'postmaster', 'hostmaster', 'webmaster', 'www', 'mail', 'smtp', 'ftp', 'ns1', 'ns2', 'info', 'noc',
  'noreply', 'mailerdaemon',
  // Placeholders and examples shown in copy; mika/theo/rin/ada are the home page personas.
  'you', 'yourname', 'name', 'username', 'handle', 'example', 'demo', 'test', 'dev', 'staging', 'null',
  'undefined', 'none', 'nobody', 'anonymous', 'everyone', 'true', 'false', 'mika', 'theo', 'rin', 'ada',
  // Platforms a Page shows badges for, and the resolver scheme names.
  'twitter', 'github', 'telegram', 'bluesky', 'bsky', 'youtube', 'spotify', 'instagram', 'threads',
  'tiktok', 'linkedin', 'facebook', 'apple', 'google', 'atproto', 'ens', 'dns',
]);

export type CredsPathSegment =
  /** `/@…` — any handle scheme; the caller checks it against the resolvers. */
  | { readonly kind: 'handle'; readonly handle: string }
  /** `/alice` — a creds.id name. `canonical: false` means the URL used capitals. */
  | { readonly kind: 'name'; readonly name: string; readonly canonical: boolean }
  | { readonly kind: 'reserved'; readonly word: string }
  | { readonly kind: 'other' };

/** `segment` is one already-decoded path segment, without slashes. */
export function classifyCredsPathSegment(segment: string): CredsPathSegment {
  if (segment.startsWith('@')) {
    return segment.length > 1 ? { kind: 'handle', handle: segment.slice(1) } : { kind: 'other' };
  }
  const lower = segment.toLowerCase();
  if (!CREDS_NAME_RE.test(lower)) return { kind: 'other' };
  if (RESERVED_NAMES.has(lower)) return { kind: 'reserved', word: lower };
  return { kind: 'name', name: lower, canonical: lower === segment };
}
