/**
 * X profile payload (docs/ref/10 §3.10) — the GraphQL profile x.com embeds in a
 * logged-out page as a JS string literal. The revealed bytes are that string's
 * body; it is un-escaped, parsed whole, and must name the claimed account. Only
 * the owner's two link slots count: links in the bio and the website field,
 * each as X expanded it. Anything X changes makes this fail, never pass.
 */
import { err, ok, type Result } from '../types/result';

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  '"': '"', "'": "'", '\\': '\\', '/': '/', n: '\n', r: '\r', t: '\t', b: '\b', f: '\f',
};

/** Body of a JS string literal → its value. Unknown escapes and raw `"` are refused. */
function unescapeJsString(body: string): Result<string, string> {
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const c = body.charAt(i);
    if (c === '"') return err('unescaped quote inside the payload');
    if (c !== '\\') {
      out += c;
      continue;
    }
    const e = body.charAt(i + 1);
    const simple = SIMPLE_ESCAPES[e];
    if (simple !== undefined) {
      out += simple;
      i += 1;
      continue;
    }
    const hex = e === 'x' ? body.slice(i + 2, i + 4) : e === 'u' ? body.slice(i + 2, i + 6) : '';
    if (hex === '' || !/^[0-9a-f]+$/iu.test(hex) || hex.length !== (e === 'x' ? 2 : 4)) return err('unknown escape in the payload');
    out += String.fromCharCode(parseInt(hex, 16));
    i += 1 + hex.length;
  }
  return ok(out);
}

const record = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function expandedUrls(slot: unknown): string[] {
  const urls = record(slot)?.['urls'];
  if (!Array.isArray(urls)) return [];
  return urls.map((u) => record(u)?.['expanded_url']).filter((u): u is string => typeof u === 'string');
}

/** The links the account itself placed in its bio and website field, as X expanded them. */
export function parseXProfile(revealed: string, handle: string): Result<readonly string[], string> {
  const text = unescapeJsString(revealed);
  if (!text.ok) return text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.value);
  } catch {
    return err('payload is not complete JSON');
  }
  const result = record(record(record(record(parsed)?.['data'])?.['user_result_by_screen_name'])?.['result']);
  const screenName = record(result?.['core'])?.['screen_name'];
  if (typeof screenName !== 'string' || screenName.toLowerCase() !== handle.toLowerCase()) {
    return err('payload is for another account');
  }
  const entities = record(record(result?.['profile_bio'])?.['entities']);
  return ok([...expandedUrls(entities?.['description']), ...expandedUrls(entities?.['url'])]);
}

/** `https://creds.id/@<name>` exactly, as X expands a link (http or https, optional www and `/`). */
export function isMarkerUrl(url: string, name: string): boolean {
  const m = /^https?:\/\/(?:www\.)?creds\.id\/@([a-z0-9]{3,30})\/?$/u.exec(url);
  return m?.[1] === name;
}
