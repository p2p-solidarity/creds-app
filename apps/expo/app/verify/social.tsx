/**
 * Verify a social link (docs/ref/10 §2) — the route a link row's 「驗證」
 * chip opens. The flow itself is `SocialVerifyPanel`, shared with the
 * add-link sheet.
 */
import { Stack, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsBackToolbar, SettingsScreenTitle } from '@/components/settings/SettingsBlocks';
import { ThemedSurface, ThemedText } from '@/components/themed';
import { SocialVerifyPanel, parseSocialTarget } from '@/components/verify/SocialVerifyPanel';
import { useTranslation } from '@/i18n';
import { safeBack } from '@/navigation/safeBack';

export default function VerifySocialScreen(): ReactNode {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ platform?: string; handle?: string }>();
  const target = parseSocialTarget(params.platform, params.handle);

  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <Stack.Screen options={{ presentation: 'modal' }} />
      <SettingsBackToolbar title={t('zktls.cancel')} onPress={() => { safeBack(); }} />
      <SettingsScreenTitle title={t('zktls.title')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}>
        {target === null ? (
          <ThemedSurface variant="inset" style={{ padding: 16 }}>
            <ThemedText variant="bodyMedium">{t('zktls.error.failed')}</ThemedText>
          </ThemedSurface>
        ) : (
          <SocialVerifyPanel target={target} onFinish={() => { safeBack(); }} />
        )}
      </ScrollView>
    </View>
  );
}
