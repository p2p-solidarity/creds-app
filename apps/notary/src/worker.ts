/**
 * creds.id Pro notary (docs/ref/10 §3.11) — one more witness for Pro users.
 *
 *   POST /v1/witness  { page, license, name }   queue a Page for the next hourly batch
 *   (cron, hourly)                               fetch each queued profile page itself,
 *                                                sign a witness with the notary npub, publish
 *
 * No TLSNotary and no prover on any device: the notary fetches the public
 * page with plain `fetch()`, checks it with the same shared platform rules
 * the phones use, and signs the same NIP-78 witness format (device
 * `{ platform: 'notary' }`), trusted by its pinned npub. Viewers trust it the
 * way they trusted the old notary — it is creds.id saying "we looked".
 *
 * Who may queue: the request carries the Page (signed by its root did) and a
 * Pro license for that did. The notary only ever witnesses what it fetched
 * itself, so a replayed request can at worst re-check the owner's own links.
 * One Durable Object holds the queue; nothing else is stored.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  buildWitnessEvent,
  checkSocialMarker,
  CREDS_LICENSE_ISSUERS,
  decodeJwtUnsafe,
  bytesToHex,
  hexToBytes,
  hexToNpub,
  npubToHex,
  pageSocialClaim,
  parseProfile,
  signNostrEventWithScalar,
  socialTargetForClaim,
  verifyCompact,
  verifyProLicense,
  type NostrEvent,
  type PageFetch,
  type WitnessStatement,
} from '@solidarity/shared';
import { schnorr } from '@noble/curves/secp256k1.js';

interface Env {
  NOTARY: DurableObjectNamespace<Notary>;
  /** Secret: hex secp256k1 scalar of the notary's witness npub (scripts/witness-key.ts). */
  NOTARY_NSEC: string;
  DIRECTORY_ORIGIN: string;
}

interface Queued {
  readonly did: string;
  readonly subject: string;
  readonly name: string;
  readonly claims: readonly string[];
  /** Unix s: the license stops renewal after this. */
  readonly licenseExp: number;
  /** Unix s: next batch that should check it. */
  readonly dueAt: number;
}

const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
const RENEW_SECONDS = 30 * 86_400;
const MAX_QUEUE = 5000;
const MAX_PER_BATCH = 200;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const fetchPage: PageFetch = async (url) => {
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { Accept: 'text/html' } });
    return { ok: true, value: { status: res.status, body: res.status === 200 ? await res.text() : '' } };
  } catch {
    return { ok: false, error: 'network' };
  }
};

/** Publish to one relay over an outbound WebSocket; resolves on OK or after 5 s. */
async function publishTo(relay: string, event: NostrEvent): Promise<boolean> {
  try {
    const res = await fetch(relay.replace(/^wss:/u, 'https:'), { headers: { Upgrade: 'websocket' } });
    const ws = res.webSocket;
    if (ws === null) return false;
    ws.accept();
    return await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 5000);
      ws.addEventListener('message', (m) => {
        try {
          const msg = JSON.parse(String(m.data)) as unknown[];
          if (msg[0] === 'OK' && msg[1] === event.id) {
            clearTimeout(timer);
            ws.close();
            resolve(msg[2] === true);
          }
        } catch {
          // ignore other frames
        }
      });
      ws.send(JSON.stringify(['EVENT', event]));
    });
  } catch {
    return false;
  }
}

export class Notary extends DurableObject<Env> {
  override async fetch(req: Request): Promise<Response> {
    let body: { page?: unknown; license?: unknown; name?: unknown };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'invalid_request' });
    }
    if (typeof body.page !== 'string' || typeof body.license !== 'string' || typeof body.name !== 'string') {
      return json(400, { error: 'invalid_request' });
    }

    // The Page: root-signed record that names its npub and the claims to witness.
    let payload: unknown = null;
    try {
      payload = decodeJwtUnsafe(body.page).payload;
    } catch {
      return json(400, { error: 'invalid_page' });
    }
    const record = parseProfile(payload);
    if (!record.ok || !verifyCompact(body.page, record.value.did).ok) return json(400, { error: 'invalid_page' });
    const subject = record.value.alsoKnownAs.find((a) => a.startsWith('nostr:npub1'))?.slice('nostr:'.length);
    const subjectHex = subject === undefined ? null : npubToHex(subject);
    if (subject === undefined || !subjectHex?.ok) return json(400, { error: 'no_npub' });

    const now = Math.floor(Date.now() / 1000);
    const license = verifyProLicense(body.license, { issuers: CREDS_LICENSE_ISSUERS, nowSeconds: now, sub: record.value.did });
    if (!license.ok) return json(402, { error: 'license', detail: license.error });
    if (!(await this.registered(body.name, subjectHex.value))) return json(403, { error: 'name_not_registered' });

    const claims = record.value.alsoKnownAs.filter((c) => socialTargetForClaim(c) !== null);
    if (claims.length === 0) return json(400, { error: 'no_claims' });
    const size = (await this.ctx.storage.list({ prefix: 'q:' })).size;
    if (size >= MAX_QUEUE) return json(503, { error: 'busy' });
    const entry: Queued = { did: record.value.did, subject, name: body.name, claims, licenseExp: license.value.exp, dueAt: now };
    await this.ctx.storage.put(`q:${subjectHex.value}`, entry);
    return json(202, { queued: claims.length, nextBatch: Math.ceil(now / 3600) * 3600 });
  }

  /** The hourly batch: check every due entry, publish witnesses, schedule renewals. */
  async runBatch(): Promise<{ checked: number; witnessed: number }> {
    const now = Math.floor(Date.now() / 1000);
    const scalar = hexToBytes(this.env.NOTARY_NSEC);
    const notaryHex = bytesToHex(schnorr.getPublicKey(scalar));
    const notaryNpub = hexToNpub(notaryHex);
    if (!notaryNpub.ok) return { checked: 0, witnessed: 0 };

    let checked = 0;
    let witnessed = 0;
    for (const [key, entry] of await this.ctx.storage.list<Queued>({ prefix: 'q:' })) {
      if (checked >= MAX_PER_BATCH) break;
      if (entry.dueAt > now) continue;
      if (entry.licenseExp <= now) {
        await this.ctx.storage.delete(key);
        continue;
      }
      checked += 1;
      for (const claim of entry.claims) {
        const target = socialTargetForClaim(claim);
        if (target === null) continue;
        const found = await checkSocialMarker(target, entry.name, fetchPage);
        if (!found.ok) continue;
        const statement: WitnessStatement = {
          v: 1,
          claim: pageSocialClaim(target.platform, target.handle),
          name: entry.name,
          subject: entry.subject,
          witness: notaryNpub.value,
          observedAt: Math.floor(Date.now() / 1000),
        };
        const signed = signNostrEventWithScalar(buildWitnessEvent(statement, { platform: 'notary' }), scalar, statement.observedAt);
        if (!signed.ok) continue;
        const accepted = await Promise.all(RELAYS.map((r) => publishTo(r, signed.value)));
        if (accepted.some(Boolean)) witnessed += 1;
      }
      await this.ctx.storage.put(key, { ...entry, dueAt: now + RENEW_SECONDS });
    }
    return { checked, witnessed };
  }

  private async registered(name: string, pubkey: string): Promise<boolean> {
    if (!/^[a-z0-9]{3,30}$/u.test(name)) return false;
    try {
      const res = await fetch(`${this.env.DIRECTORY_ORIGIN}/.well-known/nostr.json?name=${name}`);
      if (!res.ok) return false;
      const body: { names?: Record<string, unknown> } = await res.json();
      return body.names?.[name] === pubkey;
    } catch {
      return false;
    }
  }
}

const notary = (env: Env) => env.NOTARY.get(env.NOTARY.idFromName('notary'));

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== '/v1/witness') return json(404, { error: 'not_found' });
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    return notary(env).fetch(req);
  },
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await notary(env).runBatch();
  },
} satisfies ExportedHandler<Env>;
