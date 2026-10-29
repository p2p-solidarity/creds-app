import { Platform, View } from 'react-native';
import type { ReactNode } from 'react';

import { CredsMark } from '@/components/brand/CredsMark';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedButton, ThemedSurface, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { useTranslation } from '@/i18n';
import { publicPagePath } from '@/onboarding/publicPageUsername';
import { usePreferences } from '@/settings/preferences';

import { V2OnboardingScaffold } from './V2OnboardingScaffold';

export function ReadyStep({
  keysGenerated,
  onBack,
  onFirstCheck,
  onBrowse,
}: {
  readonly keysGenerated: boolean;
  readonly onBack: () => void;
  readonly onFirstCheck: () => void;
  readonly onBrowse: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const username = usePreferences((state) => state.publicPageUsername);
  const registeredUsername = usePreferences((state) => state.publicPageRegisteredUsername);
  const bindingReady = usePreferences((state) => state.publicPageBindingReady);

  return (
    <V2OnboardingScaffold
      stepIndex={4}
      title={undefined}
      subtitle={undefined}
      onBack={onBack}
      footer={
        <View style={{ gap: 10 }}>
          <ThemedButton
            label={t('ob.done.verify')}
            variant="primary"
            fullWidth
            onPress={onFirstCheck}
          />
          <ThemedButton
            label={t('ob.done.browse')}
            variant="secondary"
            fullWidth
            onPress={onBrowse}
          />
        </View>
      }>
      <View style={{ flex: 1, gap: 14, paddingTop: 8 }}>
        <View className="flex-1 items-center justify-center gap-3">
          {/* The same floating mark the welcome step opens with — the flow ends where it began. */}
          <CredsMark size={120} float />
          <ThemedText variant="headlineMedium">{t('ob.done.title')}</ThemedText>
        </View>
        <ThemedSurface variant="outlined" padded className="gap-4 rounded-xl">
          <ReadyRow
            done={keysGenerated}
            title={t('ob.done.passkey')}
            detail={t(
              Platform.OS === 'ios'
                ? 'ob.done.passkey.backedUp'
                : 'ob.done.passkey.device',
            )}
          />
          <ReadyRow
            done={bindingReady && registeredUsername.length > 0}
            title={t('ob.done.page')}
            detail={
              bindingReady && registeredUsername.length > 0
                ? publicPagePath(registeredUsername)
                : `${publicPagePath(username)} · ${t('ob.done.page.pending')}`
            }
          />
          <ReadyRow
            done={false}
            title={t('ob.done.first_check')}
            detail={t('ob.done.first_check.pending')}
          />
        </ThemedSurface>
      </View>
    </V2OnboardingScaffold>
  );
}

function ReadyRow({
  done,
  title,
  detail,
}: {
  readonly done: boolean;
  readonly title: string;
  readonly detail: string;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-3">
      <SfIcon
        name={done ? 'checkmark.circle.fill' : 'circle'}
        size={20}
        color={done ? Colors.terminalGreen : Colors.text3}
      />
      <View className="flex-1 gap-0.5">
        <ThemedText variant="label">{title}</ThemedText>
        <ThemedText variant="caption" tone="secondary" numberOfLines={1}>
          {detail}
        </ThemedText>
      </View>
    </View>
  );
}
