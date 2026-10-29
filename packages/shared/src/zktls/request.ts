/**
 * The notary's request gate (docs/ref/10 §3.8) — every notary call is a
 * NIP-98 request signed by the owner's npub key, so background renewal needs
 * no Face ID and the notary can rate-limit per npub without accounts.
 *
 * Two calls per proof: `GET /v1/session` (WebSocket upgrade, the TLSNotary
 * session for one allowlisted profile page) and `GET /v1/evidence` (pick up
 * the signed bundle for that session id). The id is chosen by the prover and
 * sits inside the signed URL, so only the npub that ran the session can pick
 * its evidence up. Replay protection is the caller's `seen` set of event ids,
 * kept for the auth window.
 */
import { base64Decode, bytesToUtf8 } from '../crypto/base64';
import { NIP98_KIND } from '../nip05/client';
import { isNostrEvent, verifyNostrEvent, type NostrEvent } from '../nostr/event';
import { err, ok, type Result } from '../types/result';
import { isZktlsPlatform, profileTarget, type ZktlsPlatform } from './platforms';

export const NIP98_WINDOW_SECONDS = 60;

const SID_PATTERN = /^[0-9a-f]{32}$/u;
const CREDS_NAME_PATTERN = /^[a-z0-9]{3,30}$/u;

export type NotaryRequestError =
  | 'invalid_auth'
  | 'expired'
  | 'replayed'
  | 'url_mismatch'
  | 'method_mismatch'
  | 'not_found'
  | 'invalid_request'
  | 'not_allowed';

interface Authed {
  /** Hex x-only pubkey of the signing npub. */
  readonly pubkey: string;
  readonly eventId: string;
  readonly createdAt: number;
}

export type NotaryRequest =
  | (Authed & {
      readonly kind: 'session';
      readonly platform: ZktlsPlatform;
      readonly handle: string;
      readonly name: string;
      readonly sid: string;
      readonly server: string;
      readonly request: string;
    })
  | (Authed & { readonly kind: 'evidence'; readonly sid: string });

export interface SessionParams {
  readonly platform: ZktlsPlatform;
  readonly handle: string;
  readonly name: string;
  readonly sid: string;
}

export function notarySessionUrl(origin: string, p: SessionParams): string {
  const q = new URLSearchParams({ platform: p.platform, handle: p.handle, name: p.name, sid: p.sid });
  return `${origin}/v1/session?${q.toString()}`;
}

export function notaryEvidenceUrl(origin: string, sid: string): string {
  return `${origin}/v1/evidence?${new URLSearchParams({ sid }).toString()}`;
}

/** The URL NIP-98 signs: always https, exact host/path/query, never forwarded headers. */
function canonicalUrl(url: URL): string {
  return `https://${url.host}${url.pathname}${url.search}`;
}

function decodeEvent(authorization: string): NostrEvent | null {
  if (!authorization.startsWith('Nostr ')) return null;
  try {
    const value: unknown = JSON.parse(bytesToUtf8(base64Decode(authorization.slice(6))));
    return isNostrEvent(value) ? value : null;
  } catch {
    return null;
  }
}

function singleTag(event: NostrEvent, name: string): string | null {
  const tags = event.tags.filter((t) => t[0] === name);
  return tags.length === 1 ? (tags[0]?.[1] ?? null) : null;
}

/** Exactly these query keys, each once — no smuggled host or second handle. */
function exactParams(url: URL, keys: readonly string[]): Record<string, string> | null {
  const entries = [...url.searchParams.entries()];
  if (entries.length !== keys.length) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (!keys.includes(k) || k in out) return null;
    out[k] = v;
  }
  return out;
}

interface GateInput {
  readonly authorization: string | null;
  readonly method: string;
  readonly url: string;
  readonly now: number;
  readonly seen: ReadonlySet<string>;
}

function authenticate(input: GateInput, url: URL): Result<Authed, NotaryRequestError> {
  const event = input.authorization === null ? null : decodeEvent(input.authorization);
  if (event?.kind !== NIP98_KIND || !verifyNostrEvent(event)) return err('invalid_auth');
  if (Math.abs(input.now - event.created_at) > NIP98_WINDOW_SECONDS) return err('expired');
  if (input.seen.has(event.id)) return err('replayed');
  if (singleTag(event, 'u') !== canonicalUrl(url)) return err('url_mismatch');
  if (input.method.toUpperCase() !== 'GET' || singleTag(event, 'method') !== 'GET') return err('method_mismatch');
  return ok({ pubkey: event.pubkey, eventId: event.id, createdAt: event.created_at });
}

function sessionRequest(authed: Authed, url: URL): Result<NotaryRequest, NotaryRequestError> {
  const q = exactParams(url, ['platform', 'handle', 'name', 'sid']);
  if (q === null) return err('invalid_request');
  const { platform, handle = '', name = '', sid = '' } = q;
  if (!isZktlsPlatform(platform)) return err('not_allowed');
  if (!SID_PATTERN.test(sid) || !CREDS_NAME_PATTERN.test(name)) return err('invalid_request');
  const target = profileTarget(platform, handle);
  if (!target.ok) return err('not_allowed');
  return ok({ ...authed, kind: 'session', platform, handle, name, sid, ...target.value });
}

export function checkNotaryRequest(input: GateInput): Result<NotaryRequest, NotaryRequestError> {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return err('invalid_request');
  }
  const authed = authenticate(input, url);
  if (!authed.ok) return authed;

  if (url.pathname === '/v1/session') return sessionRequest(authed.value, url);
  if (url.pathname !== '/v1/evidence') return err('not_found');
  const sid = exactParams(url, ['sid'])?.['sid'];
  if (sid === undefined || !SID_PATTERN.test(sid)) return err('invalid_request');
  return ok({ ...authed.value, kind: 'evidence', sid });
}
