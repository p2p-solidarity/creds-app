/**
 * Sending one private message (docs/ref/16 §2): seal + gift-wrap it from my
 * key, deliver it to the recipient's kind 10050 relays. Every message carries
 * my published Page when it fits, so the recipient can tie my npub to my DID.
 */
import { err, npubToHex, ok, type ProfileRecord, type Result } from '@solidarity/shared';

import { wrapForRecipient } from '@/nostr/userKey';
import { useProfileStore } from '@/profile/store';

import { deliverWrap, type DeliverFailure } from './relays';

/** The embedded Page must fit in the message (§2.2); a bigger one is resolved over the network. */
const MAX_EMBEDDED_PAGE_CHARS = 24_000;

export type PrivateSendFailure =
  | DeliverFailure
  | 'noNostrKey'
  | 'pageNotOnNostr'
  | 'recipientNoNostr'
  | 'wrapFailed';

/** The npub hex a saved Page declares, or null when it has not joined Nostr. */
export function recipientHexOf(record: ProfileRecord): string | null {
  for (const entry of record.alsoKnownAs) {
    if (!entry.startsWith('nostr:npub1')) continue;
    const hex = npubToHex(entry.slice('nostr:'.length));
    if (hex.ok) return hex.value;
  }
  return null;
}

export function myEmbeddablePage(): Result<string | undefined, 'pageNotOnNostr'> {
  const jws = useProfileStore.getState().nostrPublishedJws;
  if (jws === null) return err('pageNotOnNostr');
  return ok(jws.length <= MAX_EMBEDDED_PAGE_CHARS ? jws : undefined);
}

export async function sendRumor(
  input: Parameters<typeof wrapForRecipient>[0],
  recipientHex: string
): Promise<Result<string, PrivateSendFailure>> {
  const wrapped = await wrapForRecipient(input, recipientHex);
  if (!wrapped.ok) return err(wrapped.error === 'notProvisioned' ? 'noNostrKey' : 'wrapFailed');
  const delivered = await deliverWrap(wrapped.value.wrap, recipientHex);
  return delivered.ok ? ok(wrapped.value.rumorId) : delivered;
}
