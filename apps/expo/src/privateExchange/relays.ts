/**
 * Relays for NIP-17 private messages (docs/ref/16 §2.3).
 *
 * `DM_RELAYS` were measured on 2026-11-05 with throwaway keys: nos.lol and
 * relay.primal.net store kind 1059 and serve it back. relay.damus.io stores it
 * but serves it only after NIP-42 AUTH, which this app does not speak yet.
 *
 * Blind-read rule: a kind 10050 lookup that reached no relay's EOSE is
 * "unknown", never "has none" — we neither publish our own list over it nor
 * tell the user someone cannot receive.
 */
import {
  KIND_DM_RELAYS,
  buildDmRelayListEvent,
  err,
  ok,
  parseDmRelayList,
  type Result,
} from '@solidarity/shared';

import { eventMatchesFilter, publishEvent, subscribeEvents, type NostrEvent, type NostrFilter, type SubscriptionHandle } from '@/nostr/nostrAdapter';
import { DEFAULT_RELAYS, fetchLatestEvent, publishToRelays } from '@/nostr/publish';
import { getNostrPubkey, signNostrEvent } from '@/nostr/userKey';
import { getMmkv } from '@/storage/mmkv';

export const DM_RELAYS: readonly string[] = ['wss://nos.lol', 'wss://relay.primal.net'];
const LOOKUP_RELAYS: readonly string[] = [...new Set([...DEFAULT_RELAYS, ...DM_RELAYS])];
const LOOKUP_TIMEOUT_MS = 6000;
const PUBLISHED_LIST_KEY = 'privateExchange:dmRelayList:v1';

export type DmRelayLookup =
  | { readonly kind: 'found'; readonly relays: readonly string[]; readonly event: NostrEvent }
  | { readonly kind: 'none' }
  | { readonly kind: 'unreachable' };

/** Someone's kind 10050, waiting for every relay (this feeds writers). */
export async function lookupDmRelays(pubkeyHex: string): Promise<DmRelayLookup> {
  const { event, confirmed } = await fetchLatestEvent(
    LOOKUP_RELAYS,
    { kinds: [KIND_DM_RELAYS], authors: [pubkeyHex], limit: 1 },
    subscribeEvents,
    LOOKUP_TIMEOUT_MS
  );
  if (event !== null) return { kind: 'found', relays: parseDmRelayList(event), event };
  return confirmed ? { kind: 'none' } : { kind: 'unreachable' };
}

/** The id of the kind 10050 this app published, if any — so account deletion takes back only ours. */
export function readPublishedDmRelayListId(): string | null {
  try {
    return getMmkv().getString(PUBLISHED_LIST_KEY) ?? null;
  } catch {
    return null;
  }
}

let ownListInFlight: Promise<readonly string[]> | null = null;
/** Keyed by npub hex: a local wipe can bring a different key in the same process. */
let ownList: { readonly hex: string; readonly relays: readonly string[] } | null = null;

/**
 * Make sure others can reach us, and return the relays to read our inbox from.
 * Publishes `DM_RELAYS` as our 10050 only after a confirmed "none"; an existing
 * list (maybe set in another client) is kept and read from.
 */
export function ensureOwnDmRelays(): Promise<readonly string[]> {
  ownListInFlight ??= (async () => {
    try {
      const me = await getNostrPubkey();
      if (!me.ok) return DM_RELAYS;
      if (ownList?.hex === me.value) return ownList.relays;
      const lookup = await lookupDmRelays(me.value);
      if (lookup.kind === 'found') {
        ownList = { hex: me.value, relays: [...new Set([...lookup.relays, ...DM_RELAYS])] };
        return ownList.relays;
      }
      if (lookup.kind === 'unreachable') return DM_RELAYS;
      const signed = await signNostrEvent(buildDmRelayListEvent(DM_RELAYS));
      if (!signed.ok) return DM_RELAYS;
      const report = await publishToRelays(signed.value, LOOKUP_RELAYS, publishEvent);
      if (report.acceptedCount > 0) {
        try {
          getMmkv().set(PUBLISHED_LIST_KEY, signed.value.id);
        } catch {
          // Without the id, deletion leaves this list alone — harmless.
        }
        ownList = { hex: me.value, relays: DM_RELAYS };
      }
      return DM_RELAYS;
    } finally {
      ownListInFlight = null;
    }
  })();
  return ownListInFlight;
}

export type DeliverFailure = 'recipientNotReady' | 'unreachable' | 'notDelivered';

/** Publish a gift wrap to the recipient's kind 10050 relays (NIP-17 MUST). */
export async function deliverWrap(wrap: NostrEvent, recipientHex: string): Promise<Result<number, DeliverFailure>> {
  const lookup = await lookupDmRelays(recipientHex);
  if (lookup.kind === 'unreachable') return err('unreachable');
  if (lookup.kind === 'none' || lookup.relays.length === 0) return err('recipientNotReady');
  const report = await publishToRelays(wrap, lookup.relays, publishEvent);
  return report.acceptedCount > 0 ? ok(report.acceptedCount) : err('notDelivered');
}

export interface CollectedEvents {
  readonly events: readonly NostrEvent[];
  /** At least one relay delivered its whole result set. */
  readonly confirmed: boolean;
}

/** Every event matching `filter` across `relays`, plus whether any relay reached EOSE. */
export function collectEvents(relays: readonly string[], filter: NostrFilter, timeoutMs = 6000): Promise<CollectedEvents> {
  return new Promise((resolve) => {
    const found = new Map<string, NostrEvent>();
    const handles: SubscriptionHandle[] = [];
    const settled = new Set<number>();
    let confirmed = false;
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const h of handles) h.close();
      resolve({ events: [...found.values()], confirmed });
    };
    const timer = setTimeout(finish, timeoutMs);
    const settle = (index: number, eose: boolean): void => {
      if (settled.has(index)) return;
      settled.add(index);
      if (eose) confirmed = true;
      if (settled.size === relays.length) finish();
    };
    if (relays.length === 0) finish();
    relays.forEach((relay, index) => {
      handles.push(
        subscribeEvents(
          relay,
          filter,
          (event) => {
            if (eventMatchesFilter(event, filter)) found.set(event.id, event);
          },
          () => { settle(index, true); },
          () => { settle(index, false); }
        )
      );
    });
  });
}
