/**
 * Notifications — the one device-side notice the app keeps: contact updates
 * (Recent Updates), produced on this phone by the Verified Page sweep. Nothing
 * here talks to a server; the old remote-push, in-app toast and inbox-sync
 * controls left with the Shoutouts relay.
 */
import { safeBack } from '@/navigation/safeBack';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InfoButton } from '@/components/common/InfoSheet';
import {
  SettingsBackToolbar,
  SettingsBlockSection,
  SettingsBlockToggleRow,
  SettingsScreenTitle,
} from '@/components/settings/SettingsBlocks';
import { useRecentUpdatesStore } from '@/contacts/recentUpdates';
import { useTranslation } from '@/i18n';

export default function NotificationSettings() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const recentUpdatesEnabled = useRecentUpdatesStore((s) => s.enabled);
  const setRecentUpdatesEnabled = useRecentUpdatesStore((s) => s.setEnabled);

  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <SettingsBackToolbar onPress={() => { safeBack('/settings'); }} />
      <SettingsScreenTitle title={t('notifications.title')} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 24 + insets.bottom }}
      >
        <SettingsBlockSection
          index={0}
          title={t('notifications.contactUpdates.header')}
          accessory={
            <InfoButton
              title={t('notifications.contactUpdates.header')}
              body={t('notifications.contactUpdates.info')}
            />
          }
        >
          <SettingsBlockToggleRow
            icon="person.2.fill"
            title={t('notifications.contactUpdates.title')}
            subtitle={t('notifications.contactUpdates.subtitle')}
            value={recentUpdatesEnabled}
            onValueChange={setRecentUpdatesEnabled}
          />
        </SettingsBlockSection>
      </ScrollView>
    </View>
  );
}
