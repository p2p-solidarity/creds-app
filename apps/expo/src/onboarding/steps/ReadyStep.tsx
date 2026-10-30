import { ActivityIndicator, Platform, View } from 'react-native';
import type { ReactNode } from 'react';

import { CredsMark } from '@/components/brand/CredsMark';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedButton, ThemedSurface, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { useTranslation } from '@/i18n';
import { startPublicPagePublish, usePublicPagePublish } from '@/nip05/backgroundPublish';
import { publicPagePath } from '@/onboarding/publicPageUsername';
import { usePreferences } from '@/settings/preferences';

import { V2OnboardingScaffold } from './V2OnboardingScaffold';

export function ReadyStep({
  keysGenerated,
  onBack,
  onFirstCheck,
  onBrowse,
  onPickAnotherName,
}: {
  readonly keysGenerated: boolean;
  readonly onBack: () => void;
  readonly onFirstCheck: () => void;
  readonly onBrowse: () => void;
  readonly onPickAnotherName: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const username = usePreferences((state) => state.publicPageUsername);
  const registeredUsername = usePreferences((state) => state.publicPageRegisteredUsername);
  const bindingReady = usePreferences((state) => state.publicPageBindingReady);
  const publishError = usePreferences((state) => state.publicPagePublishError);
  const publishing = usePublicPagePublish((state) => state.publishing);
  const published = bindingReady && registeredUsername.length > 0;
  const pageRow: { readonly state: ReadyRowState; readonly detail: string; readonly action?: ReadyRowAction } =
    published
      ? { state: 'done', detail: publicPagePath(registeredUsername) }
      : publishing
        ? { state: 'working', detail: `${publicPagePath(username)} · ${t('ob.done.page.publishing')}` }
        : publishError === 'name_taken'
          ? {
              state: 'error',
              detail: t('ob.done.page.taken', { h: username }),
              action: { label: t('ob.done.page.pick'), onPress: onPickAnotherName },
            }
          : publishError !== ''
            ? {
                state: 'error',
                detail: `${publicPagePath(username)} · ${t('ob.done.page.failed')}`,
                action: { label: t('ob.done.page.retry'), onPress: () => { void startPublicPagePublish(username); } },
              }
            : { state: 'pending', detail: `${publicPagePath(username)} · ${t('ob.done.page.pending')}` };

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
        <ThemedSurface variant="outlined" padded className="gap-4 rounded-card">
          <ReadyRow
            state={keysGenerated ? 'done' : 'pending'}
            title={t('ob.done.passkey')}
            detail={t(
              Platform.OS === 'ios'
                ? 'ob.done.passkey.backedUp'
                : 'ob.done.passkey.device',
            )}
          />
          <ReadyRow
            state={pageRow.state}
            title={t('ob.done.page')}
            detail={pageRow.detail}
            action={pageRow.action}
          />
          <ReadyRow
            state="pending"
            title={t('ob.done.first_check')}
            detail={t('ob.done.first_check.pending')}
          />
        </ThemedSurface>
      </View>
    </V2OnboardingScaffold>
  );
}

type ReadyRowState = 'done' | 'working' | 'error' | 'pending';

interface ReadyRowAction {
  readonly label: string;
  readonly onPress: () => void;
}

function ReadyRow({
  state,
  title,
  detail,
  action,
}: {
  readonly state: ReadyRowState;
  readonly title: string;
  readonly detail: string;
  readonly action?: ReadyRowAction;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-3">
      <View style={{ width: 20, alignItems: 'center' }}>
        {state === 'working' ? (
          <ActivityIndicator size="small" color={Colors.text3} />
        ) : (
          <SfIcon
            name={
              state === 'done'
                ? 'checkmark.circle.fill'
                : state === 'error'
                  ? 'exclamationmark.triangle.fill'
                  : 'circle'
            }
            size={20}
            color={state === 'done' ? Colors.terminalGreen : state === 'error' ? Colors.warning : Colors.text3}
          />
        )}
      </View>
      <View className="flex-1 gap-0.5">
        <ThemedText variant="label">{title}</ThemedText>
        <ThemedText variant="caption" tone="secondary" numberOfLines={2}>
          {detail}
        </ThemedText>
      </View>
      {action ? (
        <ThemedButton label={action.label} variant="secondary" size="sm" onPress={action.onPress} />
      ) : null}
    </View>
  );
}
