/**
 * Privacy Policy viewer — the same text as creds.id/privacy, bundled as Markdown per
 * language in `src/legal/privacy.ts` (generated from airmeishi-web
 * `src/content/legal/`), so it reads offline. Chinese UI → zh-Hant, else en.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MarkdownDocument } from '@/components/common/MarkdownDocument';
import { SettingsScreenTitle } from '@/components/settings/SettingsBlocks';
import { useTranslation } from '@/i18n';
import { PRIVACY_POLICY_MARKDOWN } from '@/legal/privacy';
import { safeBack } from '@/navigation/safeBack';

export default function PrivacyPolicyPage(): ReactNode {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('zh') ? 'zh-Hant' : 'en';
  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <SettingsScreenTitle
        title={t('pro.privacy')}
        leadingAction={{ accessibilityLabel: t('common.back'), onPress: () => { safeBack(); } }}
      />
      <MarkdownDocument source={PRIVACY_POLICY_MARKDOWN[locale]} />
    </View>
  );
}
