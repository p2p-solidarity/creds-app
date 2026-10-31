import { parseDeepLink } from './parser';

/** `@alice`, `creds.id/@alice` or a full link → the Page link the scanner and
 *  universal links already open; null when it names no creds.id Page. */
export function credsNameLink(input: string): string | null {
  const name = input
    .trim()
    .replace(/^https?:\/\//iu, '')
    .replace(/^(www\.)?creds\.id\//iu, '')
    .replace(/^@/u, '')
    .toLowerCase();
  if (!/^[a-z0-9]{3,30}$/u.test(name)) return null;
  const link = `https://creds.id/@${name}`;
  return parseDeepLink(link).kind === 'verifiedHandle' ? link : null;
}
