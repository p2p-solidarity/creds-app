/**
 * Pull-to-refresh on Contacts: re-read every saved Page's newest signed
 * version from Nostr now instead of waiting for the background interval
 * (`AUTO_REFRESH_MIN_INTERVAL_MS`). A change lands in 「最近更新」 with its
 * own toast; otherwise one toast says whether everything was current.
 */
import { useCallback, useState, type ReactElement } from 'react';
import { RefreshControl, type RefreshControlProps } from 'react-native';

import { useThemeColors } from '@/constants/useThemeColors';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';

import { refreshVerifiedContactsNow } from './contactAutoRefresh';

/** `undefined` when there is nothing to refresh (no saved Page). */
export function usePagesPullRefresh(savedPageCount: number): ReactElement<RefreshControlProps> | undefined {
  const { t } = useTranslation();
  const c = useThemeColors();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refreshVerifiedContactsNow()
      .then((summary) => {
        if (summary.saved > 0) return;
        if (summary.ran && summary.unchanged === 0 && summary.failed > 0) {
          pushToast(t('peopleList.updatesCheckFailed'), 'error');
          return;
        }
        pushToast(t('peopleList.updatesUpToDate'), 'success', 1600);
      })
      .catch(() => {
        pushToast(t('peopleList.updatesCheckFailed'), 'error');
      })
      .finally(() => {
        setRefreshing(false);
      });
  }, [t]);

  if (savedPageCount === 0) return undefined;
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text3} />;
}
