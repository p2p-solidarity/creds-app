/**
 * Terms of Service viewer — renders the bundled TERMS_OF_SERVICE.md via
 * the shared MarkdownDocument component. The markdown is bundled as a
 * TS module at `src/legal/terms.ts` for zero-config Metro inclusion.
 */
import { safeBack } from '@/navigation/safeBack';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MarkdownDocument } from '@/components/common/MarkdownDocument';
import { SettingsScreenTitle } from '@/components/settings/SettingsBlocks';
import { useTranslation } from '@/i18n';
import { TERMS_OF_SERVICE_MARKDOWN } from '@/legal/terms';

export default function TermsOfServicePage(): ReactNode {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <SettingsScreenTitle
        title="Terms of Service"
        leadingAction={{ accessibilityLabel: t('common.back'), onPress: () => { safeBack(); } }}
      />
      <MarkdownDocument source={TERMS_OF_SERVICE_MARKDOWN} />
    </View>
  );
}
