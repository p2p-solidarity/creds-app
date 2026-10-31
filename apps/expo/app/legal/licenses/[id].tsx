/**
 * One component's license text, opened from Open-source licenses.
 * `id` is `<group>:<index>` into the bundled list.
 */
import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LicenseDetailView } from '@/components/legal/LicenseDetailView';
import { SettingsScreenTitle } from '@/components/settings/SettingsBlocks';
import { ThemedText } from '@/components/themed';
import { useTranslation } from '@/i18n';
import { findLicense } from '@/legal/licenses';
import { safeBack } from '@/navigation/safeBack';

export default function LicenseDetailPage(): ReactNode {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = typeof id === 'string' ? findLicense(id) : undefined;
  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <SettingsScreenTitle
        title={t('licenses.title')}
        leadingAction={{ accessibilityLabel: t('common.back'), onPress: () => { safeBack(); } }}
      />
      {item ? (
        <LicenseDetailView item={item} />
      ) : (
        <ThemedText variant="bodyMedium" tone="secondary" className="px-4 pt-4">
          {t('licenses.notFound')}
        </ThemedText>
      )}
    </View>
  );
}
