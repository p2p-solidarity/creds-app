/**
 * Appearance settings — the app's colour mode (System / Light / Dark).
 *
 * The Swift-era card accent, glow toggle and animal theme are gone: the
 * creds.id card has one look, and the animal theme never reached any screen.
 * How the public Page looks is set on the Page itself (頁面外觀).
 */
import { safeBack } from '@/navigation/safeBack';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/common/PressableScale';
import {
  SettingsBackToolbar,
  SettingsBlockSectionHeader,
  SettingsEnter,
  SettingsScreenTitle,
} from '@/components/settings/SettingsBlocks';
import { Colors } from '@/constants/Colors';
import { useTranslation } from '@/i18n';
import { type AppColorScheme, usePreferences } from '@/settings/preferences';

const COLOR_MODE_VALUES: readonly AppColorScheme[] = ['system', 'light', 'dark'];

const COLOR_MODE_LABEL_KEYS: Readonly<Record<AppColorScheme, string>> = {
  system: 'appearance.colorMode.system',
  light: 'appearance.colorMode.light',
  dark: 'appearance.colorMode.dark',
};

export default function AppearanceSettings() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const colorScheme = usePreferences((s) => s.appColorScheme);
  const setPref = usePreferences((s) => s.set);

  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <SettingsBackToolbar onPress={() => { safeBack('/settings'); }} />
      <SettingsScreenTitle title={t('appearance.title')} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 24 + insets.bottom }}
      >
        <View className="gap-6">
          {/* Color Mode */}
          <SettingsEnter index={0} style={{ gap: 8 }}>
            <SettingsBlockSectionHeader title={t('appearance.colorMode.header')} />
            <View className="px-4">
              <View
                className="bg-mutedSurface rounded-group flex-row"
                style={{ padding: 4 }}
              >
                {COLOR_MODE_VALUES.map((value) => {
                  const active = colorScheme === value;
                  const label = t(COLOR_MODE_LABEL_KEYS[value]);
                  return (
                    <PressableScale
                      key={value}
                      fill
                      haptic="selection"
                      onPress={() => { setPref('appColorScheme', value); }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={label}
                      className="items-center justify-center rounded-button"
                      style={{
                        minHeight: 36,
                        paddingVertical: 8,
                        backgroundColor: active ? Colors.cardBg : 'transparent',
                      }}
                    >
                      <Text
                        className="text-[13px]"
                        style={{
                          color: active ? Colors.text1 : Colors.text2,
                          fontWeight: active ? '600' : '400',
                        }}
                      >
                        {label}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>
            </View>
          </SettingsEnter>

        </View>
      </ScrollView>
    </View>
  );
}
