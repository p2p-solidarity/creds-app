/**
 * Add one link straight to the Page (the Page tab's add sheet): the link is
 * appended public, the Page is re-signed once (the root signer's usual
 * gate), and — only when the owner opted into auto-publishing and has a
 * Nostr key — republished. Same rules as Me › Edit's Save, minus the form.
 *
 * Photo: when the link's page yields a profile picture and the Page has no
 * photo yet, it rides along in the same signature; when the Page already has
 * one, the picture comes back as a suggestion for a one-tap swap
 * (`applyPagePhoto`).
 */
import { pushToast } from '@/feedback/toast';
import { translate } from '@/i18n';
import { DEFAULT_RELAYS } from '@/nostr/publish';
import { hasNostrKey } from '@/nostr/userKey';
import { readLocalAvatarUri } from '@/profile/localAvatar';
import { normalizeLinkUrl } from '@/profile/linkUrl';
import { resolveLinkPreview } from '@/profile/linkPreviewStore';
import { useProfileStore } from '@/profile/store';
import { usePreferences } from '@/settings/preferences';
import { err, ok, type ProfileLink, type Result } from '@solidarity/shared';

const PREVIEW_WAIT_MS = 2500;

export type QuickAddFailure = 'noProfile' | 'duplicate' | 'saveFailed';

export interface QuickAddResult {
  readonly avatarApplied: string | null;
  readonly avatarSuggestion: string | null;
}

/** Relays can take seconds; the sheet moves on and only a failure speaks up. */
function publishInBackground(): void {
  void (async () => {
    if (!usePreferences.getState().nostrAutoRepublish || !(await hasNostrKey())) return;
    const published = await useProfileStore.getState().publishToNostr(DEFAULT_RELAYS);
    if (!published.ok) pushToast(translate('meEdit.publishFailed'), 'warning');
  })();
}

export async function quickAddLink(link: ProfileLink): Promise<Result<QuickAddResult, QuickAddFailure>> {
  const { record, linkVisibility, saveProfile } = useProfileStore.getState();
  if (record === null) return err('noProfile');
  const url = normalizeLinkUrl(link.url);
  if (record.links.some((existing) => normalizeLinkUrl(existing.url) === url)) return err('duplicate');

  // The sheet already fetched the preview while the owner looked at it; this
  // only waits a moment for a fetch still in flight, never blocks the save.
  const preview = await Promise.race([
    resolveLinkPreview(url),
    new Promise<null>((resolve) => setTimeout(() => { resolve(null); }, PREVIEW_WAIT_MS)),
  ]);
  const picture = preview?.avatar ?? null;
  // "No photo" means neither a signed one nor a device-only library photo.
  const hasPhoto = (record.avatar ?? null) !== null || readLocalAvatarUri() !== null;
  const applyPicture = picture !== null && !hasPhoto;

  const saved = await saveProfile(
    {
      displayName: record.displayName,
      bio: record.bio,
      links: [...record.links, { label: link.label.trim(), url }],
      linkVisibility: [...record.links.map((_, i) => linkVisibility[i] ?? 'public'), 'public'],
    },
    applyPicture ? { avatar: picture } : {},
  );
  if (!saved.ok) return err('saveFailed');
  publishInBackground();

  return ok({
    avatarApplied: applyPicture ? picture : null,
    avatarSuggestion: applyPicture || picture === record.avatar ? null : picture,
  });
}

/** Swap the Page photo for a fetched profile picture (one signature). */
export async function applyPagePhoto(picture: string): Promise<boolean> {
  const { record, linkVisibility, saveProfile } = useProfileStore.getState();
  if (record === null) return false;
  const saved = await saveProfile(
    { displayName: record.displayName, bio: record.bio, links: record.links, linkVisibility },
    { avatar: picture },
  );
  if (!saved.ok) return false;
  publishInBackground();
  return true;
}
