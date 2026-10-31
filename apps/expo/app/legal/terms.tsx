/**
 * Terms of Service viewer — the same text as creds.id/terms, bundled as Markdown per
 * language in `src/legal/terms.ts` (generated from airmeishi-web
 * `src/content/legal/`), so it reads offline. Chinese UI → zh-Hant, else en.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MarkdownDocument } from '@/components/common/MarkdownDocument';
import { SettingsScreenTitle } from '@/components/settings/SettingsBlocks';
import { useTranslation } from '@/i18n';
import { TERMS_OF_SERVICE_MARKDOWN } from '@/legal/terms';
import { safeBack } from '@/navigation/safeBack';

export default function TermsOfServicePage(): ReactNode {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('zh') ? 'zh-Hant' : 'en';
  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <SettingsScreenTitle
        title={t('pro.terms')}
        leadingAction={{ accessibilityLabel: t('common.back'), onPress: () => { safeBack(); } }}
      />
      <MarkdownDocument source={TERMS_OF_SERVICE_MARKDOWN[locale]} />
    </View>
  );
}
