/**
 * Terms of Service viewer — the same text as creds.id/terms, bundled per language in
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

export default function TermsOfServicePage(): ReactNode {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <SettingsScreenTitle
        title={t('pro.terms')}
        leadingAction={{ accessibilityLabel: t('common.back'), onPress: () => { safeBack(); } }}
      />
      <LegalDocumentView documentId="terms" />
    </View>
  );
}
