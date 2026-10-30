/**
 * v2 Settings hub. The public page is deliberately first because its username
 * is the account's shareable address. Protocol inspectors and credential tools
 * remain behind the five-tap Developer Options unlock.
 *
 * Two levels at most (docs/ref/notes-settings-ia-2026-10.md): a setting with
 * one or two controls (colour mode, language, Recent Updates, Pear exchange,
 * the two resets) lives here as an inline row instead of its own sub-page.
 */
import Constants from 'expo-constants';
import i18n from 'i18next';
import { router, useFocusEffect } from 'expo-router';
import { safeBack } from '@/navigation/safeBack';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  SettingsBlockInfoRow,
  SettingsBlockRow,
  SettingsBlockSection,
  SettingsBlockSectionHeader,
  SettingsBlockSegmentRow,
  SettingsBlockToggleRow,
  SettingsScreenTitle,
} from '@/components/settings/SettingsBlocks';
import { SettingsResetSection } from '@/components/settings/SettingsResetSection';
import { useRecentUpdatesStore } from '@/contacts/recentUpdates';
import { readPasskeyCount } from '@/identity/passkeyRegistry';
import { haptic } from '@/feedback/haptics';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import { publicPagePath } from '@/onboarding/publicPageUsername';
import { stopLaneManager } from '@/pear/laneManager';
import { advanceDeveloperUnlock } from '@/settings/developerUnlock';
import { type AppColorScheme, usePreferences } from '@/settings/preferences';

const COLOR_MODES: readonly { readonly value: AppColorScheme; readonly labelKey: string }[] = [
  { value: 'system', labelKey: 'appearance.colorMode.system' },
  { value: 'light', labelKey: 'appearance.colorMode.light' },
  { value: 'dark', labelKey: 'appearance.colorMode.dark' },
];

// Native names on purpose: someone who can't read the current language still
// finds their own.
const LANGUAGES: readonly { readonly value: string; readonly label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh-Hant', label: '繁體中文' },
];

export default function SettingsHub() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const developerMode = usePreferences((s) => s.developerMode);
  const publicPageUsername = usePreferences((s) => s.publicPageUsername);
  const backupEnabled = usePreferences((s) => s.backupEnabled);
  const colorScheme = usePreferences((s) => s.appColorScheme);
  // '' = follow the device; the live i18n language still marks a segment.
  const language = usePreferences((s) => s.language) || i18n.language;
  const pearEnabled = usePreferences((s) => s.pearExchangeEnabled);
  const recentUpdatesEnabled = useRecentUpdatesStore((s) => s.enabled);
  const setRecentUpdatesEnabled = useRecentUpdatesStore((s) => s.setEnabled);
  const setPref = usePreferences((s) => s.set);
  const tapCountRef = useRef(0);
  const [passkeyCount, setPasskeyCount] = useState<ReturnType<typeof readPasskeyCount> | null>(null);
  useFocusEffect(useCallback(() => { setPasskeyCount(readPasskeyCount()); }, []));

  const version = Constants.expoConfig?.version ?? 'Unknown';

  // The counter is deliberately component-local; only the enabled preference
  // persists. Taps one and two stay silent so this remains a hidden entry.
  const onVersionTap = () => {
    const transition = advanceDeveloperUnlock(tapCountRef.current, developerMode);
    tapCountRef.current = transition.nextTapCount;

    if (transition.effect.kind === 'enabled') {
      setPref('developerMode', true);
      haptic('success');
      pushToast(t('settingsHub.devUnlock.enabled'), 'success', 3000);
    } else if (transition.effect.kind === 'countdown') {
      const countdownKey = transition.effect.remaining === 1
        ? 'settingsHub.devUnlock.remainingOne'
        : 'settingsHub.devUnlock.remainingMany';
      pushToast(
        t(countdownKey, { count: transition.effect.remaining }),
        'info',
        1500,
      );
    }
  };

  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <SettingsScreenTitle
        title={t('settingsHub.title')}
        leadingAction={{
          accessibilityLabel: 'Back',
          onPress: () => { safeBack(); },
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 60 + insets.bottom }}
      >
        <View className="gap-6">
          <SettingsBlockSection index={0} title={t('settingsHub.publicPage')}>
            <SettingsBlockRow
              icon="at"
              title={t('settingsHub.myUsername')}
              subtitle={publicPageUsername
                ? publicPagePath(publicPageUsername)
                : t('settingsHub.usernamePrompt')}
              onPress={() => { router.push('/settings/username'); }}
            />
          </SettingsBlockSection>

          {/* Account */}
          <SettingsBlockSection index={1} title={t('settingsHub.accountIdentity')}>
            <SettingsBlockRow
              icon="key.fill"
              title={t('settingsHub.passkeys')}
              trailingText={passkeyCount === null ? t('settingsHub.passkeysLoading') : passkeyCount.ok
                ? t('settingsHub.passkeysCount', { count: passkeyCount.value }) : t('settingsHub.passkeysUnavailable')}
              onPress={() => { router.push('/settings/passkeys'); }}
            />
            <SettingsBlockRow
              icon="lock.shield"
              title={t('settingsHub.accountProtection')}
              onPress={() => { router.push('/settings/security'); }}
            />
            <SettingsBlockRow
              icon="icloud"
              title={t('settingsHub.identityExport')}
              trailingText={backupEnabled ? t('common.on') : t('common.off')}
              onPress={() => { router.push('/settings/backup'); }}
            />
            <SettingsBlockRow
              icon="key.horizontal"
              title={t('settingsHub.recoveryPhrase')}
              onPress={() => { router.push('/settings/identity-export'); }}
            />
          </SettingsBlockSection>

          <SettingsBlockSection index={2} title={t('settingsHub.plan')}>
            <SettingsBlockRow
              icon="sparkles"
              title={t('settingsHub.plan')}
              onPress={() => { router.push('/settings/pro'); }}
            />
          </SettingsBlockSection>

          <SettingsBlockSection index={3} title={t('settingsHub.preferences')}>
            <SettingsBlockSegmentRow
              icon="circle.lefthalf.filled"
              title={t('settingsHub.appearance')}
              options={COLOR_MODES.map((m) => ({ value: m.value, label: t(m.labelKey) }))}
              value={colorScheme}
              onChange={(next) => { setPref('appColorScheme', next); }}
            />
            <SettingsBlockSegmentRow
              icon="globe"
              title={t('settingsHub.language')}
              options={LANGUAGES}
              value={language}
              onChange={(next) => {
                setPref('language', next);
                void i18n.changeLanguage(next);
              }}
            />
            <SettingsBlockToggleRow
              icon="bell"
              title={t('notifications.contactUpdates.title')}
              subtitle={t('notifications.contactUpdates.subtitle')}
              value={recentUpdatesEnabled}
              onValueChange={setRecentUpdatesEnabled}
            />
            <SettingsBlockToggleRow
              icon="person.2"
              title={t('settingsHub.pearExchange')}
              subtitle={t('settingsHub.pearExchangeSubtitle')}
              value={pearEnabled}
              onValueChange={(next) => {
                if (!next) stopLaneManager();
                setPref('pearExchangeEnabled', next);
              }}
            />
          </SettingsBlockSection>

          <SettingsBlockSection index={4} title={t('settingsHub.data')}>
            <SettingsBlockRow
              icon="square.and.arrow.up"
              title={t('settingsHub.exportContacts')}
              subtitle={t('settingsHub.exportContactsSubtitle')}
              onPress={() => {
                router.push({ pathname: '/(tabs)/people', params: { edit: '1' } });
              }}
            />
            <SettingsBlockRow
              icon="square.and.arrow.down"
              title={t('settingsHub.importContacts')}
              onPress={() => { router.push('/contacts/import-vcf'); }}
            />
          </SettingsBlockSection>

          <SettingsResetSection index={5} />

          {developerMode ? (
            <SettingsBlockSection index={6} title={t('settingsHub.developer')}>
              <SettingsBlockRow
                icon="hammer"
                title={t('developer.title')}
                subtitle={t('settingsHub.developerSubtitle')}
                onPress={() => { router.push('/settings/developer'); }}
              />
            </SettingsBlockSection>
          ) : null}

          <View className="gap-3">
            <SettingsBlockSectionHeader title={t('settingsHub.about')} />
            <View className="px-4 gap-2">
              <SettingsBlockRow
                icon="arrow.counterclockwise"
                title={t('settingsHub.replayOnboarding')}
                onPress={() => { router.push('/onboarding?replay=1'); }}
              />
              <SettingsBlockRow
                icon="hand.raised"
                title={t('settingsHub.privacyPolicy')}
                onPress={() => { router.push('/legal/privacy'); }}
              />
              <Pressable
                onPress={onVersionTap}
                accessibilityRole="button"
                accessibilityLabel={t('settingsHub.version')}
              >
                <SettingsBlockInfoRow
                  icon="info.circle"
                  title={t('settingsHub.version')}
                  value={version}
                />
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
