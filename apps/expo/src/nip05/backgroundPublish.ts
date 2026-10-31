import { create } from 'zustand';

import { usePreferences } from '@/settings/preferences';

import { publishChosenPageName } from './publishChosenPageName';
import type { PublicPageNamePublishResult } from './workflow';

/**
 * Onboarding's Page publish, run after the signed Page is saved so the user is
 * not held on a spinner while relays answer (measured 2026-10-29: ~25 s, most
 * of it waiting on a relay that times out). The outcome lands in the same
 * preferences Settings › Username writes; `publishing` is the in-flight flag
 * the Ready step shows. A killed app simply leaves the Page unpublished, which
 * Settings › Username republishes.
 */
export const usePublicPagePublish = create<{ readonly publishing: boolean }>(() => ({
  publishing: false,
}));

let inFlight: Promise<PublicPageNamePublishResult> | null = null;

export function startPublicPagePublish(name: string): Promise<PublicPageNamePublishResult> {
  if (inFlight) return inFlight;
  const setPreference = usePreferences.getState().set;
  setPreference('publicPagePublishError', '');
  usePublicPagePublish.setState({ publishing: true });
  inFlight = publishChosenPageName(name)
    .catch((): PublicPageNamePublishResult => (
      { status: 'localOnly', name, reason: 'profile_publish_failed' }
    ))
    .then((published) => {
      applyPublishResult(published);
      return published;
    })
    .finally(() => {
      inFlight = null;
      usePublicPagePublish.setState({ publishing: false });
    });
  return inFlight;
}

function applyPublishResult(published: PublicPageNamePublishResult): void {
  const setPreference = usePreferences.getState().set;
  switch (published.status) {
    case 'ready':
      setPreference('publicPageRegisteredUsername', published.name);
      setPreference('publicPageBindingReady', true);
      setPreference('publicPagePublishError', '');
      setPreference('publicPageRetryAt', null);
      break;
    case 'registered':
      setPreference('publicPageRegisteredUsername', published.name);
      setPreference('publicPageBindingReady', false);
      setPreference('publicPagePublishError', published.reason);
      break;
    case 'nameTaken':
      setPreference('publicPagePublishError', 'name_taken');
      break;
    case 'renameTooSoon':
      setPreference('publicPagePublishError', 'rename_too_soon');
      setPreference('publicPageRetryAt', published.retryAt ?? null);
      break;
    case 'localOnly':
      setPreference('publicPagePublishError', published.reason);
      break;
  }
}
