/**
 * creds.id notary — the Worker half (docs/ref/10 §3.1, §3.6, §3.8).
 *
 *   GET /v1/session?platform&handle&name&sid   WebSocket → TLSNotary verifier in the Container
 *   GET /v1/evidence?sid                       → { cert, evidence } for that finished session
 *
 * Every call is NIP-98 signed by the owner's npub (shared `checkNotaryRequest`).
 * One Durable Object owns the Container, the replay set and the per-npub rate
 * limit, all in memory only — nothing about who verified what is stored.
 * The Container holds no keys and only reports what it witnessed; this side
 * re-checks those facts against the shared platform rules and signs them with
 * the month's key, whose root-signed cert travels with the evidence.
 */
import { DurableObject } from 'cloudflare:workers';
import { p256 } from '@noble/curves/nist.js';
import { decodeJwtUnsafe, hexToBytes } from '@solidarity/shared';
import { hexToNpub } from '@solidarity/shared/nostr';
import {
  checkEvidenceFacts,
  checkNotaryRequest,
  EVIDENCE_TYP,
  NIP98_WINDOW_SECONDS,
  signEvidence,
  type NotaryCert,
  type NotaryRequest,
  type NotaryRequestError,
} from '@solidarity/shared/zktls';

import certs from '../keys/certs.json';

interface Env {
  NOTARY: DurableObjectNamespace<Notary>;
  /** Secret: `{ "<monthly did:key>": "<private key hex>" }` from scripts/keys.ts. */
  NOTARY_KEYS: string;
  REQUIRE_REGISTERED: string;
  DIRECTORY_ORIGIN: string;
}

const TLSN_VERSION = '0.1.0-alpha.15';
const SESSIONS_PER_HOUR = 20;
const PENDING_TTL_MS = 5 * 60_000;

const STATUS: Record<NotaryRequestError, number> = {
  invalid_auth: 401,
  expired: 401,
  replayed: 401,
  url_mismatch: 401,
  method_mismatch: 405,
  not_found: 404,
  invalid_request: 400,
  not_allowed: 403,
};

type Session = Extract<NotaryRequest, { kind: 'session' }>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** This month's signing key: a NOTARY_KEYS entry whose root-signed cert window covers `now`. */
function currentKey(env: Env, now: number): { did: string; key: Uint8Array; cert: string } | null {
  const keys = JSON.parse(env.NOTARY_KEYS) as Record<string, string>;
  for (const cert of certs) {
    const { payload } = decodeJwtUnsafe<NotaryCert>(cert);
    const hex = keys[payload.did];
    if (hex !== undefined && payload.nbf <= now && now <= payload.exp) {
      return { did: payload.did, key: hexToBytes(hex), cert };
    }
  }
  return null;
}

export class Notary extends DurableObject<Env> {
  private readonly seen = new Map<string, number>();
  private readonly sessionsByNpub = new Map<string, number[]>();
  private readonly pending = new Map<string, { session: Session; at: number }>();

  override async fetch(req: Request): Promise<Response> {
    const now = Math.floor(Date.now() / 1000);
    for (const [id, at] of this.seen) if (now - at > NIP98_WINDOW_SECONDS * 2) this.seen.delete(id);
    for (const [sid, p] of this.pending) if (Date.now() - p.at > PENDING_TTL_MS) this.pending.delete(sid);

    const gate = checkNotaryRequest({
      authorization: req.headers.get('Authorization'),
      method: req.method,
      url: req.url,
      now,
      seen: new Set(this.seen.keys()),
    });
    if (!gate.ok) return json(STATUS[gate.error], { error: gate.error });
    this.seen.set(gate.value.eventId, now);
    return gate.value.kind === 'session' ? this.session(req, gate.value) : this.evidence(gate.value.pubkey, gate.value.sid);
  }

  private async session(req: Request, s: Session): Promise<Response> {
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json(426, { error: 'websocket_required' });
    if (this.pending.has(s.sid)) return json(409, { error: 'sid_in_use' });

    const recent = (this.sessionsByNpub.get(s.pubkey) ?? []).filter((t) => Date.now() - t < 3_600_000);
    if (recent.length >= SESSIONS_PER_HOUR) return json(429, { error: 'rate_limited' });
    if (this.env.REQUIRE_REGISTERED !== 'false' && !(await this.registered(s.name, s.pubkey))) {
      return json(403, { error: 'not_registered' });
    }
    this.sessionsByNpub.set(s.pubkey, [...recent, Date.now()]);
    this.pending.set(s.sid, { session: s, at: Date.now() });

    const container = await this.container();
    if (container === null) return json(503, { error: 'notary_unavailable' });
    const headers = new Headers(req.headers);
    headers.delete('Authorization');
    headers.set('X-Notary-Sid', s.sid);
    headers.set('X-Notary-Server', s.server);
    headers.set('X-Notary-Request', s.request);
    return container.getTcpPort(8080).fetch(new Request('http://container/session', { headers }));
  }

  private async evidence(pubkey: string, sid: string): Promise<Response> {
    const pending = this.pending.get(sid);
    if (pending?.session.pubkey !== pubkey) return json(404, { error: 'unknown_session' });
    const container = this.ctx.container;
    if (!container?.running) return json(503, { error: 'notary_unavailable' });

    // The verifier records its facts right after the prover closes; allow it a moment.
    let res: Response | null = null;
    for (let i = 0; i < 10 && (res === null || res.status === 404); i++) {
      if (i > 0) await sleep(300);
      res = await container.getTcpPort(8081).fetch(`http://container/facts/${sid}`);
    }
    if (res === null || res.status === 404) return json(409, { error: 'session_not_finished' });
    this.pending.delete(sid);
    if (res.status !== 200) return json(422, { error: 'not_witnessed' });

    const witnessed = await res.json<{ server: string; request: string; revealed: string }>();
    const { platform, handle } = pending.session;
    const facts = checkEvidenceFacts({ platform, handle, ...witnessed });
    if (!facts.ok) return json(422, { error: 'outside_platform_rule' });

    const now = Math.floor(Date.now() / 1000);
    const key = currentKey(this.env, now);
    const npub = hexToNpub(pubkey);
    if (key === null || !npub.ok) return json(503, { error: 'notary_unavailable' });
    const evidence = await signEvidence(
      { typ: EVIDENCE_TYP, platform, handle, ...witnessed, npub: npub.value, iat: now, tlsn: TLSN_VERSION },
      key.did,
      (digest) => Promise.resolve(p256.sign(digest, key.key, { prehash: false })),
    );
    return json(200, { cert: key.cert, evidence });
  }

  /** The npub must own `name` in the creds.id directory (nostr.json returns name → pubkey only). */
  private async registered(name: string, pubkey: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.env.DIRECTORY_ORIGIN}/.well-known/nostr.json?name=${name}`);
      if (!res.ok) return false;
      const body = await res.json<{ names?: Record<string, string> }>();
      return body.names?.[name] === pubkey;
    } catch {
      return false;
    }
  }

  private async container(): Promise<Container | null> {
    const container = this.ctx.container;
    if (container === undefined) return null;
    if (!container.running) {
      const images = (container as unknown as { images: Record<string, unknown> }).images;
      container.start({ image: images['notary'], enableInternet: true, instance: 'standard-1' } as ContainerStartupOptions);
    }
    for (let i = 0; i < 60; i++) {
      try {
        const res = await container.getTcpPort(8081).fetch('http://container/healthz');
        if (res.ok) return container;
      } catch {
        // still booting
      }
      await sleep(1000);
    }
    return null;
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (new URL(req.url).pathname === '/healthz') return json(200, { ok: true });
    return env.NOTARY.get(env.NOTARY.idFromName('notary')).fetch(req);
  },
} satisfies ExportedHandler<Env>;
