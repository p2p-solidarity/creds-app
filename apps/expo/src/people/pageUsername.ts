/**
 * The creds.id name of a saved Page, for Pages saved without one (a QR scan,
 * an inbox share, anything saved before names were kept).
 *
 * The name is only taken when every direction agrees, the same gate the
 * handle badge uses (`verifyNip05Binding`): the Page claims a Nostr key, that
 * key's profile says `name@creds.id`, and the creds.id directory maps the
 * name back to that key. A Page that merely says a name gets none.
 */
import { atprotoBindingIO } from '@/atproto/bindingIo';
import { fetchKind0FromRelays } from '@/nostr/fetchKind0';
import { DEFAULT_RELAYS } from '@/nostr/publish';
import {
  DEFAULT_HANDLE_RESOLVERS,
  NIP05_DOMAIN,
  npubToHex,
  resolveHandle,
  verifyNip05Binding,
  type ProfileRecord,
} from '@solidarity/shared';

export type PageUsernameResult =
  | { readonly kind: 'name'; readonly name: string }
  /** Checked: this Page has no creds.id name that holds both ways. */
  | { readonly kind: 'none' }
  /** Could not finish the check (offline, relay or directory down). */
  | { readonly kind: 'unknown' };

const SUFFIX = `@${NIP05_DOMAIN}`;

export async function resolvePageUsername(record: ProfileRecord): Promise<PageUsernameResult> {
  const npub = record.alsoKnownAs
    .find((entry) => entry.startsWith('nostr:npub1'))
    ?.slice('nostr:'.length);
  if (npub === undefined) return { kind: 'none' };
  const hex = npubToHex(npub);
  if (!hex.ok) return { kind: 'none' };

  const kind0 = await fetchKind0FromRelays(hex.value, DEFAULT_RELAYS).catch(() => null);
  if (kind0 === null) return { kind: 'unknown' };
  const content = kind0.contentJson;
  const nip05 =
    typeof content === 'object' && content !== null && !Array.isArray(content)
      ? (content as Record<string, unknown>)['nip05']
      : undefined;
  if (typeof nip05 !== 'string' || !nip05.toLowerCase().endsWith(SUFFIX)) return { kind: 'none' };
  const name = nip05.slice(0, -SUFFIX.length).toLowerCase();

  const resolution = await resolveHandle(name, DEFAULT_HANDLE_RESOLVERS, atprotoBindingIO, {
    schemeHint: 'nip05',
  });
  if (!resolution.ok) {
    return resolution.error === 'unreachable' ? { kind: 'unknown' } : { kind: 'none' };
  }
  const value = resolution.value;
  if (value.kind !== 'nip05' || value.status !== 'active') return { kind: 'none' };
  const binding = await verifyNip05Binding(record, value, () => Promise.resolve(kind0));
  if (binding.state === 'verified') return { kind: 'name', name: value.name };
  return binding.state === 'stale' ? { kind: 'unknown' } : { kind: 'none' };
}
