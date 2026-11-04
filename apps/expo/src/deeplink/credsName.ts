import { CREDS_NAME_RE } from '@solidarity/shared';

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
  if (!CREDS_NAME_RE.test(name)) return null;
  const link = `https://creds.id/@${name}`;
  return parseDeepLink(link).kind === 'verifiedHandle' ? link : null;
}
