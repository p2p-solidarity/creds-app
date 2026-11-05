const USERNAME_RE = /^[a-z0-9]+$/u;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 30;

const RESERVED_USERNAMES = new Set([
  '_',
  'admin',
  'administrator',
  'api',
  'app',
  'airmeishi',
  'abuse',
  'billing',
  'bot',
  'creds',
  'credsid',
  'dev',
  'ftp',
  'help',
  'helpdesk',
  'id',
  'legal',
  'login',
  'mail',
  'mod',
  'moderator',
  'nostr',
  'ns1',
  'ns2',
  'null',
  'official',
  'pay',
  'payment',
  'postmaster',
  'privacy',
  'root',
  'security',
  'settings',
  'signup',
  'smtp',
  'solidarity',
  'staff',
  'staging',
  'support',
  'system',
  'team',
  'terms',
  'test',
  'undefined',
  'verify',
  'verification',
  'verified',
  'www',
]);

export type PublicPageUsernameValidation =
  | { readonly kind: 'empty' }
  | { readonly kind: 'tooShort' }
  | { readonly kind: 'tooLong' }
  | { readonly kind: 'invalidCharacters' }
  | { readonly kind: 'reserved' }
  | { readonly kind: 'valid' };

export function normalizePublicPageUsernameInput(value: string): string {
  // `@alice`, `creds.id/@alice` or a full link all mean `alice`; strip the
  // address first or `creds.id/@alice` collapses to `credsidalice`.
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, '')
    .replace(/^(www\.)?creds\.id\/?/u, '')
    .replace(/^@/u, '')
    // A pasted link's `?ref=…`, `#…` or trailing path is not part of the name.
    .replace(/[/?#].*$/u, '')
    .replace(/[^a-z0-9]/gu, '');
}

export function validatePublicPageUsername(
  value: string,
): PublicPageUsernameValidation {
  if (value.length === 0) return { kind: 'empty' };
  if (!USERNAME_RE.test(value)) return { kind: 'invalidCharacters' };
  if (value.length < MIN_USERNAME_LENGTH) return { kind: 'tooShort' };
  if (value.length > MAX_USERNAME_LENGTH) return { kind: 'tooLong' };
  if (RESERVED_USERNAMES.has(value)) return { kind: 'reserved' };
  return { kind: 'valid' };
}

export function publicPagePath(username: string): string {
  return `creds.id/${username}`;
}
