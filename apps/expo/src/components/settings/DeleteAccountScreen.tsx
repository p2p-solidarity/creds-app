/**
 * Settings → Delete account. Says what goes, what stays and why, reminds that
 * a store subscription is cancelled in the store, then deletes behind ONE
 * red-line Face ID gate (`rotateMasterKey`, see sensitiveActionPolicy.ts).
 *
 * A failed step is shown as failed with a Retry — never "deleted". The phone
 * keeps its keys until every server step went through, so Retry can finish
 * the job (`src/account/accountDeletion.ts`).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SfIcon } from '@/components/icons/SfIcon';
import { SettingsBlockSection, SettingsScreenTitle } from '@/components/settings/SettingsBlocks';
import { ThemedButton, ThemedText } from '@/components/themed';
import { useThemeColors } from '@/constants/useThemeColors';
import { appAlert } from '@/feedback/appAlert';
import { confirmDialog } from '@/feedback/confirmDialog';
import { useTranslation } from '@/i18n';
import { requireSensitiveAction } from '@/keychain';
import { safeBack } from '@/navigation/safeBack';
import {
  ACCOUNT_DELETION_STEPS,
  type AccountDeletionStep,
  type StepOutcome,
} from '@/account/accountDeletion';
import { deleteAccountEverywhere } from '@/account/productionAccountDeletion';

const SUBSCRIPTIONS_URL = Platform.select({
  ios: 'https://apps.apple.com/account/subscriptions',
  default: 'https://play.google.com/store/account/subscriptions',
});

type RunState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly current: AccountDeletionStep; readonly steps: Partial<Record<AccountDeletionStep, StepOutcome>> }
  | { readonly kind: 'incomplete'; readonly steps: Readonly<Record<AccountDeletionStep, StepOutcome>> };

function StepRow({ step, outcome, running }: { step: AccountDeletionStep; outcome: StepOutcome | undefined; running: boolean }) {
  const { t } = useTranslation();
  const c = useThemeColors();
  const status =
    running ? null
    : outcome?.kind === 'done' ? { icon: 'checkmark.circle.fill' as const, color: c.text1, label: t('deleteAccount.status.done') }
    : outcome?.kind === 'nothing' ? { icon: 'circle.dashed' as const, color: c.text3, label: t('deleteAccount.status.nothing') }
    : outcome?.kind === 'failed' ? { icon: 'xmark.circle.fill' as const, color: c.destructive, label: t('deleteAccount.status.failed') }
    : outcome?.kind === 'notRun' ? { icon: 'clock.fill' as const, color: c.text3, label: t('deleteAccount.status.notRun') }
    : { icon: 'circle.dashed' as const, color: c.text3, label: t('deleteAccount.status.pending') };
  return (
    <View className="flex-row items-center" style={{ gap: 10, paddingVertical: 8 }}>
      <View style={{ width: 20, alignItems: 'center' }}>
        {status === null ? <ActivityIndicator size="small" color={c.text2} /> : <SfIcon name={status.icon} size={16} color={status.color} />}
      </View>
      <ThemedText variant="bodySmall" style={{ flex: 1 }}>{t(`deleteAccount.step.${step}`)}</ThemedText>
      <ThemedText variant="caption" tone={outcome?.kind === 'failed' ? 'error' : 'secondary'}>
        {status === null ? t('deleteAccount.status.running') : status.label}
      </ThemedText>
    </View>
  );
}

export function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [run, setRun] = useState<RunState>({ kind: 'idle' });
  const busy = run.kind === 'running';

  const onDelete = async () => {
    if (busy) return;
    if (run.kind === 'idle') {
      const ok = await confirmDialog({
        title: t('deleteAccount.confirmTitle'),
        message: t('deleteAccount.confirmMessage'),
        confirmLabel: t('deleteAccount.confirmAction'),
        destructive: true,
      });
      if (!ok) return;
    }
    // Red line: irreversible, so it prompts in every Face ID mode.
    const gate = await requireSensitiveAction('rotateMasterKey', t('security.prompt.deleteAccount'));
    if (!gate.success) return;

    setRun({ kind: 'running', current: 'nostr', steps: {} });
    const result = await deleteAccountEverywhere((current, done) => {
      setRun({ kind: 'running', current, steps: done });
    });
    if (result.kind === 'deleted') {
      appAlert({ title: t('deleteAccount.doneTitle'), message: t('deleteAccount.doneMessage') });
      router.replace('/onboarding');
      return;
    }
    setRun({ kind: 'incomplete', steps: result.steps });
  };

  const steps = run.kind === 'idle' ? null : run.steps;

  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <SettingsScreenTitle
        title={t('deleteAccount.title')}
        leadingAction={busy ? undefined : { accessibilityLabel: t('common.back'), onPress: () => { safeBack('/settings'); } }}
      />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: 24, paddingBottom: 40 + insets.bottom }}>
        <View className="gap-6">
          <SettingsBlockSection index={0} title={t('deleteAccount.section.deleted')}>
            <View style={{ gap: 6, paddingHorizontal: 12, paddingVertical: 10 }}>
              {(['page', 'name', 'vault', 'pro', 'device'] as const).map((key) => (
                <ThemedText key={key} variant="bodySmall">{`• ${t(`deleteAccount.deleted.${key}`)}`}</ThemedText>
              ))}
            </View>
          </SettingsBlockSection>

          <SettingsBlockSection index={1} title={t('deleteAccount.section.kept')}>
            <View style={{ gap: 6, paddingHorizontal: 12, paddingVertical: 10 }}>
              {(['name', 'relays', 'others', 'backups'] as const).map((key) => (
                <ThemedText key={key} variant="bodySmall" tone="secondary">{`• ${t(`deleteAccount.kept.${key}`)}`}</ThemedText>
              ))}
            </View>
          </SettingsBlockSection>

          <SettingsBlockSection index={2} title={t('deleteAccount.section.subscription')} footer={t('deleteAccount.subscriptionFooter')}>
            <ThemedButton
              label={t('deleteAccount.manageSubscription')}
              variant="secondary"
              fullWidth
              disabled={busy}
              onPress={() => { void Linking.openURL(SUBSCRIPTIONS_URL); }}
            />
          </SettingsBlockSection>

          {steps !== null && (
            <SettingsBlockSection
              index={3}
              title={t('deleteAccount.section.progress')}
              footer={run.kind === 'incomplete' ? t('deleteAccount.incompleteFooter') : undefined}
            >
              <View style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
                {ACCOUNT_DELETION_STEPS.map((step) => (
                  <StepRow key={step} step={step} outcome={steps[step]} running={run.kind === 'running' && run.current === step} />
                ))}
              </View>
            </SettingsBlockSection>
          )}

          <View className="px-4">
            <ThemedButton
              label={run.kind === 'incomplete' ? t('deleteAccount.retry') : t('deleteAccount.action')}
              variant="destructive"
              fullWidth
              loading={busy}
              onPress={() => { void onDelete(); }}
            />
            <ThemedText variant="caption" tone="tertiary" className="pt-3 text-center">
              {t('deleteAccount.webHint')}
            </ThemedText>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
