/**
 * p2p witnesses (docs/ref/10 §3.11): this phone fetches a Page's linked
 * profile itself (tier 4), and — only when the user taps — publishes a
 * witness signed by their npub and their attested device key (tier 3). The
 * owner's own check is the same thing with `witness === subject`.
 *
 * Every witness is verified with the same shared verifier a viewer runs
 * before it leaves the phone; one whose attestation no longer verifies
 * (expired RKP chain) gets a fresh device key once.
 */
import {
  buildWitnessEvent,
  checkSocialMarker,
  CREDS_DEVICE_TRUST,
  err,
  ok,
  pageSocialClaim,
  summarizeWitnesses,
  verifyWitness,
  WITNESS_EVENT_KIND,
  witnessDTag,
  type MarkerCheckFailure,
  type PageFetch,
  type Result,
  type SocialTarget,
  type WitnessStatement,
  type WitnessSummary,
} from '@solidarity/shared';

import { publishEvent, subscribeEvents, type NostrEvent, type SubscriptionHandle } from '@/nostr/nostrAdapter';
import { eventMatchesFilter, publishToRelays, type PublishReport } from '@/nostr/publish';
import { fetchKind0FromRelays } from '@/nostr/fetchKind0';
import { getNostrPubkey, npubEncode, signNostrEvent } from '@/nostr/userKey';
import { NIP05_SERVICE_ORIGIN } from '@/nip05/client';

import { dropDeviceKey, signWithDeviceKey, type DeviceKeyFailure } from './deviceKey';

/** Pages served to a phone: follow redirects, read as text, never throw. */
export const fetchPublicPage: PageFetch = async (url) => {
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { Accept: 'text/html' } });
    return ok({ status: res.status, body: res.status === 200 ? await res.text() : '' });
  } catch {
    return err('network');
  }
};

/** Tier 4: does `target`'s public page name `creds.id/@<name>` right now, fetched by this phone? */
export function checkOnThisPhone(target: SocialTarget, name: string): Promise<Result<void, MarkerCheckFailure>> {
  return checkSocialMarker(target, name, fetchPublicPage);
}

export type WitnessFailure = MarkerCheckFailure | DeviceKeyFailure | 'noNostrKey' | 'deviceRejected';

async function myNpub(): Promise<Result<{ hex: string; npub: string }, 'noNostrKey'>> {
  const hex = await getNostrPubkey();
  if (!hex.ok) return err('noNostrKey');
  const npub = npubEncode(hex.value);
  return npub.ok ? ok({ hex: hex.value, npub: npub.value }) : err('noNostrKey');
}

async function signWitness(statement: WitnessStatement, npubHex: string): Promise<Result<NostrEvent, WitnessFailure>> {
  const text = JSON.stringify(statement);
  const device = await signWithDeviceKey(npubHex, text);
  if (!device.ok) return device;
  const signed = await signNostrEvent(buildWitnessEvent(statement, device.value));
  if (!signed.ok) return err('noNostrKey');
  const verified = verifyWitness(signed.value, CREDS_DEVICE_TRUST);
  return verified.ok ? ok(signed.value) : err('deviceRejected');
}

/**
 * Check `target` on this phone and build a signed witness for `subject`'s
 * Page (pass your own npub to prove your own link). Not published here.
 */
export async function createWitness(
  target: SocialTarget,
  name: string,
  subject: string,
): Promise<Result<NostrEvent, WitnessFailure>> {
  const me = await myNpub();
  if (!me.ok) return me;
  const checked = await checkOnThisPhone(target, name);
  if (!checked.ok) return checked;
  const statement: WitnessStatement = {
    v: 1,
    claim: pageSocialClaim(target.platform, target.handle),
    name,
    subject,
    witness: me.value.npub,
    observedAt: Math.floor(Date.now() / 1000),
  };
  const first = await signWitness(statement, me.value.hex);
  if (first.ok || first.error !== 'deviceRejected') return first;
  // The cached attestation no longer verifies (short-lived chain): attest a fresh key once.
  dropDeviceKey();
  return signWitness(statement, me.value.hex);
}

export function publishWitness(event: NostrEvent, relays: readonly string[]): Promise<PublishReport> {
  return publishToRelays(event, relays, publishEvent);
}

/** Collect every matching event from `relays` until each answers EOSE (or the deadline). */
export function fetchEvents(
  relays: readonly string[],
  filter: Parameters<typeof subscribeEvents>[1],
  timeoutMs = 4000,
): Promise<readonly NostrEvent[]> {
  return new Promise((resolve) => {
    const found = new Map<string, NostrEvent>();
    const handles: SubscriptionHandle[] = [];
    let pending = relays.length;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const h of handles) h.close();
      resolve([...found.values()]);
    };
    const timer = setTimeout(finish, timeoutMs);
    const settle = () => {
      pending -= 1;
      if (pending <= 0) finish();
    };
    if (relays.length === 0) finish();
    for (const relay of relays) {
      handles.push(
        subscribeEvents(
          relay,
          filter,
          (event) => {
            if (eventMatchesFilter(event, filter)) found.set(event.id, event);
          },
          settle,
          settle,
        ),
      );
    }
  });
}

/** Witnesses of each claim of one Page, verified and counted (shared rules). */
export async function fetchWitnessSummaries(
  page: { readonly subject: string; readonly subjectHex: string; readonly name: string; readonly claims: readonly string[] },
  relays: readonly string[],
): Promise<ReadonlyMap<string, WitnessSummary>> {
  const out = new Map<string, WitnessSummary>();
  if (page.claims.length === 0) return out;
  const events = await fetchEvents(relays, {
    kinds: [WITNESS_EVENT_KIND],
    '#d': page.claims.map((c) => witnessDTag(c, page.subjectHex)),
  });
  const now = Math.floor(Date.now() / 1000);
  for (const claim of page.claims) {
    out.set(
      claim,
      summarizeWitnesses(events, { subject: page.subject, claim, name: page.name }, CREDS_DEVICE_TRUST, now),
    );
  }
  return out;
}

/**
 * The creds.id name a Page's npub holds: its kind-0 `nip05` must say
 * `name@creds.id` AND creds.id's directory must map that name back to the
 * npub (NIP-05). Null when either side doesn't answer or they disagree.
 */
export async function resolveCredsName(npubHex: string, relays: readonly string[]): Promise<string | null> {
  const kind0 = await fetchKind0FromRelays(npubHex, relays);
  const content = kind0?.contentJson;
  const nip05 = typeof content === 'object' && content !== null ? (content as Record<string, unknown>)['nip05'] : undefined;
  if (typeof nip05 !== 'string') return null;
  const m = /^([a-z0-9]{3,30})@creds\.id$/u.exec(nip05.toLowerCase());
  const name = m?.[1];
  if (name === undefined) return null;
  try {
    const res = await fetch(`${NIP05_SERVICE_ORIGIN}/.well-known/nostr.json?name=${name}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { names?: Record<string, unknown> };
    return body.names?.[name] === npubHex ? name : null;
  } catch {
    return null;
  }
}
