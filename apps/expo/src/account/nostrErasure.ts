/**
 * Account deletion, Nostr half: take back what THIS app published under the
 * user's Nostr key, and nothing else.
 *
 * The key may be an imported nsec the person also uses in other Nostr
 * clients, so "delete every event by this author" would destroy their notes
 * and profile elsewhere. The app's own footprint is narrow and recognisable:
 *
 * - kind 30078 records whose `d` tag is in our namespace — the Page pointer
 *   (`solidarity.profile`), public disclosures (`solidarity.disclosure.…`),
 *   the DAG head (`solidarity-dag-v1`) and witness statements
 *   (`creds.witness:…`). Each gets an empty replacement (relays that ignore
 *   NIP-09 then serve nothing) and a NIP-09 `a` + `e` deletion request.
 * - kind 0: the app only ever adds `alsoKnownAs: [did:…]` and a
 *   `nip05: name@creds.id`. Those two are stripped and the rest republished
 *   untouched; only a kind 0 left empty is also asked to be deleted.
 *
 * Relays are other people's servers: a NIP-09 request is a request. Copies
 * already fetched by others can't be recalled — the privacy policy says so.
 */
import { err, ok, type Result } from '@solidarity/shared';

import type { NostrEvent, NostrFilter } from '@/nostr/nostrAdapter';

export const OWN_D_TAG_PREFIXES = ['solidarity', 'creds.'] as const;
const KIND_METADATA = 0;
const KIND_APP_DATA = 30078;
const KIND_DELETION = 5;
const CREDS_NIP05_SUFFIX = '@creds.id';

export interface UnsignedEvent {
  readonly kind: number;
  readonly tags: string[][];
  readonly content: string;
}

export interface NostrErasurePlan {
  /** Published first: empty replacements and the stripped kind 0. */
  readonly replacements: readonly UnsignedEvent[];
  /** Published last, so its `a` tags also cover the replacements. */
  readonly deletion: UnsignedEvent | null;
}

function dTag(event: NostrEvent): string | null {
  const tag = event.tags.find((t) => t[0] === 'd');
  return typeof tag?.[1] === 'string' ? tag[1] : null;
}

export function isOwnAppRecord(event: NostrEvent, pubkey: string): boolean {
  if (event.pubkey !== pubkey || event.kind !== KIND_APP_DATA) return false;
  const d = dTag(event);
  return d !== null && OWN_D_TAG_PREFIXES.some((prefix) => d.startsWith(prefix));
}

/** The kind-0 content without what the app put there; `null` = nothing of ours. */
export function stripKind0(content: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const base = { ...(parsed as Record<string, unknown>) };
  let changed = false;
  if (Array.isArray(base['alsoKnownAs'])) {
    const kept = base['alsoKnownAs'].filter((v) => !(typeof v === 'string' && v.startsWith('did:')));
    if (kept.length !== base['alsoKnownAs'].length) {
      changed = true;
      if (kept.length === 0) delete base['alsoKnownAs'];
      else base['alsoKnownAs'] = kept;
    }
  }
  if (typeof base['nip05'] === 'string' && base['nip05'].toLowerCase().endsWith(CREDS_NIP05_SUFFIX)) {
    delete base['nip05'];
    changed = true;
  }
  return changed ? base : null;
}

export function planNostrErasure(
  pubkey: string,
  appRecords: readonly NostrEvent[],
  kind0: NostrEvent | null,
): NostrErasurePlan {
  const own = appRecords.filter((e) => isOwnAppRecord(e, pubkey));
  const dTags = [...new Set(own.flatMap((e) => dTag(e) ?? []))];
  const replacements: UnsignedEvent[] = dTags.map((d) => ({ kind: KIND_APP_DATA, tags: [['d', d]], content: '' }));
  const eTags = own.map((e) => ['e', e.id]);
  const kinds = new Set<number>(own.length > 0 ? [KIND_APP_DATA] : []);

  if (kind0 !== null && kind0.pubkey === pubkey) {
    const stripped = stripKind0(kind0.content);
    if (stripped !== null) {
      replacements.push({ kind: KIND_METADATA, tags: [], content: JSON.stringify(stripped) });
      if (Object.keys(stripped).length === 0) {
        eTags.push(['e', kind0.id]);
        kinds.add(KIND_METADATA);
      }
    }
  }

  const deletion: UnsignedEvent | null =
    eTags.length === 0
      ? null
      : {
          kind: KIND_DELETION,
          tags: [
            ...eTags,
            ...dTags.map((d) => ['a', `${KIND_APP_DATA}:${pubkey}:${d}`]),
            ...[...kinds].map((k) => ['k', String(k)]),
          ],
          content: 'creds account deleted',
        };
  return { replacements, deletion };
}

// ── IO ──────────────────────────────────────────────────────────────────

export type NostrErasureFailure = 'noKey' | 'relaysUnreachable' | 'signFailed' | 'publishFailed';

export interface NostrErasureDeps {
  readonly relays: readonly string[];
  readonly getPubkey: () => Promise<Result<string, string>>;
  readonly sign: (unsigned: UnsignedEvent) => Promise<Result<NostrEvent, string>>;
  readonly subscribe: (
    relay: string,
    filter: NostrFilter,
    onEvent: (event: NostrEvent) => void,
    onEose?: () => void,
    onError?: (message: string) => void,
  ) => { readonly close: () => void };
  /** Majority-quorum publish (`publishToRelays`). */
  readonly publish: (event: NostrEvent, relays: readonly string[]) => Promise<{ readonly success: boolean }>;
  readonly timeoutMs?: number;
}

/** Every stored event matching `filter`; `confirmed` once any relay sent EOSE. */
function collect(
  deps: NostrErasureDeps,
  filter: NostrFilter,
): Promise<{ readonly events: NostrEvent[]; readonly confirmed: boolean }> {
  return new Promise((resolve) => {
    const byId = new Map<string, NostrEvent>();
    let pending = deps.relays.length;
    let confirmed = false;
    const handles: { close: () => void }[] = [];
    const finish = () => {
      clearTimeout(timer);
      for (const h of handles) h.close();
      resolve({ events: [...byId.values()], confirmed });
    };
    const settleOne = (eose: boolean) => {
      if (eose) confirmed = true;
      pending -= 1;
      if (pending === 0) finish();
    };
    const timer = setTimeout(finish, deps.timeoutMs ?? 6000);
    if (pending === 0) finish();
    for (const relay of deps.relays) {
      let settled = false;
      const once = (eose: boolean) => {
        if (settled) return;
        settled = true;
        settleOne(eose);
      };
      handles.push(
        deps.subscribe(
          relay,
          filter,
          (event) => { byId.set(event.id, event); },
          () => { once(true); },
          () => { once(false); },
        ),
      );
    }
  });
}

export async function eraseNostrFootprint(deps: NostrErasureDeps): Promise<Result<{ readonly published: number }, NostrErasureFailure>> {
  const pubkey = await deps.getPubkey();
  if (!pubkey.ok) return err('noKey');

  const [records, metadata] = await Promise.all([
    collect(deps, { kinds: [KIND_APP_DATA], authors: [pubkey.value], limit: 500 }),
    collect(deps, { kinds: [KIND_METADATA], authors: [pubkey.value], limit: 5 }),
  ]);
  // Without one relay's EOSE we can't tell "nothing published" from "didn't hear".
  if (!records.confirmed || !metadata.confirmed) return err('relaysUnreachable');

  const latestKind0 = metadata.events
    .filter((e) => e.kind === KIND_METADATA && e.pubkey === pubkey.value)
    .reduce<NostrEvent | null>((best, e) => (best === null || e.created_at > best.created_at ? e : best), null);
  const plan = planNostrErasure(pubkey.value, records.events, latestKind0);

  const unsigned = [...plan.replacements, ...(plan.deletion ? [plan.deletion] : [])];
  for (const event of unsigned) {
    const signed = await deps.sign(event);
    if (!signed.ok) return err('signFailed');
    const report = await deps.publish(signed.value, deps.relays);
    if (!report.success) return err('publishFailed');
  }
  return ok({ published: unsigned.length });
}
