import { useEffect } from 'react';

import { useProfileStore } from '@/profile/store';
import { usePreferences } from '@/settings/preferences';

/**
 * Whether creds.id serves this Page at its online address. The address stays
 * live once relays took the Page, so a newer local edit waiting to be
 * published must not take the online form away. Evidence, any of: the sticky
 * `nostrPagePublishedOnce`, the current public JWS confirmed on relays, or a
 * name binding (it is only set after the Page published).
 *
 * Installs that published before the sticky flag existed only carried the
 * exact-JWS match, which every edit clears; this backfills the flag the first
 * time that evidence is seen so the online form no longer flickers away.
 */
export function usePageAddressLive(): boolean {
  const published = useProfileStore((state) => state.published);
  const nostrPublishedJws = useProfileStore((state) => state.nostrPublishedJws);
  const publishedOnce = usePreferences((state) => state.nostrPagePublishedOnce);
  const bindingReady = usePreferences((state) => state.publicPageBindingReady);
  const confirmedNow = published !== null && nostrPublishedJws === published.jws;

  useEffect(() => {
    if (!publishedOnce && (confirmedNow || bindingReady)) {
      usePreferences.getState().set('nostrPagePublishedOnce', true);
    }
  }, [bindingReady, confirmedNow, publishedOnce]);

  return published !== null && (publishedOnce || confirmedNow || bindingReady);
}
