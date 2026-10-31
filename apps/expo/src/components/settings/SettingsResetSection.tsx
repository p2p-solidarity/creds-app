/**
 * The Settings hub's reset rows — destructive, product-facing reset actions
 * that used to sit one level down on a two-row "Reset Options" page.
 *
 * Reset App Data always requires biometric authentication: `rotateMasterKey`
 * is one of the RED_LINE_ACTIONS no Face ID mode can disarm
 * (`src/keychain/sensitiveActionPolicy.ts`). It clears the complete MMKV store
 * and the in-memory store mirrors hydrated from it, restores preference
 * defaults, and deliberately preserves recovery/signing keys held outside MMKV.
 */
import { router } from 'expo-router';
import { useState } from 'react';

import {
  SettingsBlockDangerRow,
  SettingsBlockSection,
} from '@/components/settings/SettingsBlocks';
import { appAlert, showError } from '@/feedback/appAlert';
import { confirmDialog } from '@/feedback/confirmDialog';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import { useIdentityData } from '@/identity';
import { requireSensitiveAction } from '@/keychain';
import { resetAppDataKeepingKeys } from '@/settings/productionWipe';
import { getMmkv } from '@/storage/mmkv';
import { clearAll as clearPassportAnchors } from '@/zk/passportAnchorStore';

export function SettingsResetSection({ index }: { readonly index: number }) {
  const { t } = useTranslation();
  const removePassportCredentials = useIdentityData((s) => s.removePassportCredentials);
  const [busy, setBusy] = useState(false);

  const onResetAppData = async () => {
    const ok = await confirmDialog({
      title: t('advanced.resetAppData.confirmTitle'),
      message: t('advanced.resetAppData.confirmMessage'),
      confirmLabel: t('advanced.resetAppData.confirmAction'),
      destructive: true,
    });
    if (!ok || busy) return;
    setBusy(true);
    try {
      // rotateMasterKey is gated unconditionally — see RED_LINE_ACTIONS.
      const gate = await requireSensitiveAction(
        'rotateMasterKey',
        t('security.prompt.resetAppData')
      );
      if (!gate.success) return;
      await resetAppDataKeepingKeys();
      pushToast(t('advanced.resetAppData.done'), 'success');
      router.replace('/onboarding');
    } catch (err) {
      showError({ context: 'Settings › Reset App Data', summary: t('advanced.resetAppData.failed'), error: err });
    } finally {
      setBusy(false);
    }
  };

  const onResetPassport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await removePassportCredentials();
      clearPassportAnchors();
      const mmkv = getMmkv();
      for (const k of mmkv.getAllKeys()) {
        if (k.startsWith('passport:')) mmkv.remove(k);
      }
      appAlert({ title: t('advanced.settingsTitle'), message: t('advanced.resetPassport.done') });
    } catch (err) {
      showError({
        context: 'Settings › Delete Passport Attestations',
        summary: t('advanced.resetAppData.failed'),
        error: err,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsBlockSection index={index} title={t('settingsHub.reset')}>
      <SettingsBlockDangerRow
        icon="arrow.counterclockwise"
        title={t('advanced.resetAppData')}
        subtitle={t('advanced.resetAppData.subtitle')}
        onPress={() => { void onResetAppData(); }}
      />
      <SettingsBlockDangerRow
        icon="xmark.bin"
        title={t('advanced.resetPassport')}
        onPress={() => { void onResetPassport(); }}
      />
      <SettingsBlockDangerRow
        icon="person.crop.circle.badge.xmark"
        title={t('deleteAccount.title')}
        subtitle={t('deleteAccount.rowSubtitle')}
        onPress={() => { router.push('/settings/delete-account'); }}
      />
    </SettingsBlockSection>
  );
}
