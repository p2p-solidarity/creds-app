import type { ReactNode } from 'react';
import { View } from 'react-native';

import { WorldArt } from '@/components/decor/WorldArt';
import { ThemedButton } from '@/components/themed';
import { useTranslation } from '@/i18n';

import { V2OnboardingScaffold } from './V2OnboardingScaffold';

export function WelcomeStep({
  onStart,
  onExistingAccount,
}: {
  readonly onStart: () => void;
  readonly onExistingAccount: () => void;
}): ReactNode {
  const { t } = useTranslation();

  return (
    <V2OnboardingScaffold
      stepIndex={0}
      title={t('ob.welcome.title')}
      subtitle={t('ob.welcome.sub')}
      footer={
        <View style={{ gap: 10 }}>
          <ThemedButton
            label={t('ob.welcome.start')}
            variant="primary"
            fullWidth
            onPress={onStart}
          />
          <ThemedButton
            label={t('ob.welcome.has_account')}
            variant="secondary"
            fullWidth
            onPress={onExistingAccount}
          />
        </View>
      }>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <WorldArt name="welcome" size={240} />
      </View>
    </V2OnboardingScaffold>
  );
}
