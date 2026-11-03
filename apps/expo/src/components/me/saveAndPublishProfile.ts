/**
 * Sign the profile, then (optionally) publish it to Nostr — the one save
 * chain shared by the full editor (`app/me/edit.tsx`) and the Page tab's
 * direct photo picker. Failures surface through `showError`; a Face ID
 * cancel comes back as `'cancelled'` with no error sheet.
 */
import { showError } from '@/feedback/appAlert';
import { haptic } from '@/feedback/haptics';
import type { useTranslation } from '@/i18n';
import {
  isBiometricCancellation,
  isNostrPublishOutcomePartiallyAccepted,
  isNostrPublishOutcomeSuccessful,
  publishWithNostrAutoSetup,
} from '@/nostr/connectWizard';
import { DEFAULT_RELAYS } from '@/nostr/publish';
import { linkDisplay } from '@/profile/linkPresentation';
import { hasNostrKey, provisionFromRootMnemonic } from '@/nostr/userKey';
import {
  useProfileStore,
  type NostrPublishOutcome,
  type ProfileEditableFields,
  type ProfileSaveOptions,
} from '@/profile/store';

import type { ProfileCommitResult } from './useAvatarEditor';

type TFn = ReturnType<typeof useTranslation>['t'];

export interface PublishChoice {
  readonly publishAfterSave: boolean;
  /** Only the editor's explicit Save may create a missing Nostr key. */
  readonly allowNostrProvisioning: boolean;
}

export function publishFailureDetail(outcome: NostrPublishOutcome, t: TFn): string {
  return t('nostrConnect.publishReportDetail', {
    profileAccepted: outcome.profile.acceptedCount,
    profileTotal: outcome.profile.results.length,
    bindingAccepted: outcome.kind0.acceptedCount,
    bindingTotal: outcome.kind0.results.length,
  });
}

/**
 * The schema names a bad link only by index (`links.3.url: …`); turn that
 * into the link the owner sees, so the error says which one to fix or remove.
 */
export function failureSummary(error: string, links: ProfileEditableFields['links'], fallback: string, t: TFn): string {
  const index = /\blinks\.(\d+)\b/u.exec(error)?.[1];
  const link = index === undefined ? undefined : links[Number(index)];
  if (link === undefined) return fallback;
  return t('meEdit.invalidLink', { link: linkDisplay(link.label, link.url).text });
}

export async function saveAndPublishProfile(
  fields: ProfileEditableFields,
  saveOptions: ProfileSaveOptions,
  { publishAfterSave, allowNostrProvisioning }: PublishChoice,
  t: TFn,
): Promise<ProfileCommitResult> {
  const { saveProfile, publishToNostr } = useProfileStore.getState();
  const saved = await saveProfile(fields, saveOptions);
  if (!saved.ok) {
    if (isBiometricCancellation(saved.error)) return 'cancelled';
    haptic('error');
    showError({
      context: 'Me › Edit',
      summary: failureSummary(saved.error, fields.links, t('meEdit.saveFailed'), t),
      error: new Error(saved.error),
    });
    return 'saveFailed';
  }

  if (!publishAfterSave) return 'success';

  const published = allowNostrProvisioning
    ? await publishWithNostrAutoSetup({
        hasKey: hasNostrKey,
        provision: provisionFromRootMnemonic,
        publish: async () => await publishToNostr(DEFAULT_RELAYS),
      })
    : await publishToNostr(DEFAULT_RELAYS);
  if (!published.ok) {
    if (isBiometricCancellation(published.error)) return 'cancelled';
    haptic('error');
    showError({
      context: 'Me › Edit › Publish',
      summary: failureSummary(published.error, fields.links, t('meEdit.publishFailed'), t),
      error: new Error(published.error),
    });
    return 'publishFailed';
  }
  if (
    !isNostrPublishOutcomeSuccessful(published.value) &&
    isNostrPublishOutcomePartiallyAccepted(published.value)
  ) {
    return 'partialSuccess';
  }
  if (!isNostrPublishOutcomeSuccessful(published.value)) {
    haptic('error');
    showError({
      context: 'Me › Edit › Publish',
      summary: t('meEdit.publishFailed'),
      error: new Error(publishFailureDetail(published.value, t)),
    });
    return 'publishFailed';
  }
  return 'success';
}
