/**
 * Privacy Policy viewer — the same text as creds.id/privacy, bundled per language in
 * `src/legal/documents.ts` (generated from airmeishi-web `src/content/legal/`),
 * so it reads offline. Chinese UI → zh-Hant, else en.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LegalDocumentView } from '@/components/legal/LegalDocumentView';
import { SettingsScreenTitle } from '@/components/settings/SettingsBlocks';
import { useTranslation } from '@/i18n';
import { safeBack } from '@/navigation/safeBack';

export default function PrivacyPolicyPage(): ReactNode {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <SettingsScreenTitle
        title={t('pro.privacy')}
        leadingAction={{ accessibilityLabel: t('common.back'), onPress: () => { safeBack(); } }}
      />
      <LegalDocumentView documentId="privacy" />
    </View>
  );
}
