import { getRootDid } from '@/identity/rootKey';
import { DEFAULT_RELAYS } from '@/nostr/publish';
import { resolveProfileByNpub } from '@/nostr/resolveProfile';
import { getNostrPubkey, npubEncode } from '@/nostr/userKey';
import { useProfileStore } from '@/profile/store';
import { usePreferences } from '@/settings/preferences';
import { resolveCredsName } from '@/witness/witness';

/**
 * A recovery phrase brings back the keys only. Pull this key's own published
 * Page and creds.id name back so the owner isn't sent through onboarding as a
 * stranger (where their own name reads as "taken" and a fresh profile would
 * overwrite the published one). Both must check out against this key — the
 * Page signed by our root DID and bound to our npub, the name mapped back to
 * our npub — or nothing is written.
 */
export async function recoverOwnPage(): Promise<void> {
  if (useProfileStore.getState().record !== null) return;
  const pubkey = await getNostrPubkey();
  if (!pubkey.ok) return;
  const npub = npubEncode(pubkey.value);
  const did = await getRootDid();
  if (!npub.ok || !did.ok) return;

  const [name, page] = await Promise.all([
    resolveCredsName(pubkey.value, DEFAULT_RELAYS),
    resolveProfileByNpub(npub.value),
  ]);
  if (name === null || page.kind !== 'verified' || page.record.did !== did.value) {
    return;
  }

  const { record } = page;
  const saved = await useProfileStore.getState().saveProfile(
    { displayName: record.displayName, bio: record.bio, links: record.links },
    {
      avatar: record.avatar,
      alsoKnownAs: record.alsoKnownAs,
      badges: record.badges,
      ...(record.page ? { page: record.page } : {}),
      updatedAt: record.updatedAt,
    }
  );
  if (!saved.ok) return;
  // Re-signing makes a new JWS (ECDSA isn't deterministic), so the relays'
  // copy no longer matches the "live" marker. Republish the same content once
  // so the marker comes from a real relay accept; on failure the Page simply
  // offers "Publish" as for any unpublished edit.
  await useProfileStore.getState().publishToNostr(DEFAULT_RELAYS);

  const setPref = usePreferences.getState().set;
  setPref('publicPageUsername', name);
  setPref('publicPageRegisteredUsername', name);
  // resolveCredsName checked both halves (directory → npub, kind-0 → name),
  // the same evidence a fresh registration needs before it reads "ready".
  setPref('publicPageBindingReady', true);
  setPref('publicPagePublishError', '');
  setPref('publicPageRetryAt', null);
}
