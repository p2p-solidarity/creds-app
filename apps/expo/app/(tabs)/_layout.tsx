/**
 * Tabs layout — Page / Present / Contacts. The route folders keep their
 * older names for compatibility.
 *
 * Renders the three primary tabs and delegates the bottom bar to
 * `FloatingTabBar` (flat divider + pageBg + tap haptic).
 */
import { Tabs } from 'expo-router';

import { FloatingTabBar } from '@/components/tabs/FloatingTabBar';
import { useTranslation } from '@/i18n';
import { PRIMARY_TABS } from '@/navigation/primaryTabs';
import { themeRefreshLayout } from '@/navigation/themeRefresh';

export default function TabsLayout() {
  const { t } = useTranslation();
  const [pageTab, presentTab, contactsTab] = PRIMARY_TABS;
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      screenLayout={themeRefreshLayout}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tabs.Screen name={pageTab.route} options={{ title: t(pageTab.titleKey) }} />
      <Tabs.Screen name={presentTab.route} options={{ title: t(presentTab.titleKey) }} />
      <Tabs.Screen name={contactsTab.route} options={{ title: t(contactsTab.titleKey) }} />
    </Tabs>
  );
}
