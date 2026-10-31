/**
 * Settings → Open-source licenses: every third-party component in this build,
 * grouped by where it comes from (JavaScript, iOS, Android, Rust, fonts), as
 * rounded setting groups. A row opens the component's license text. The list
 * is long (~800 rows), so it is a virtualised SectionList, not a ScrollView of
 * SettingsBlockSections.
 */
import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { Linking, SectionList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { SettingsBlockRow } from '@/components/settings/SettingsBlocks';
import { ThemedSurface, ThemedText } from '@/components/themed';
import { useThemeColors } from '@/constants/useThemeColors';
import { useTranslation } from '@/i18n';
import { LICENSE_GROUPS, licenseKey, type LicenseGroupId, type LicenseItem } from '@/legal/licenses';

export const APP_SOURCE_URL = 'https://github.com/p2p-solidarity/creds-app';

interface Row {
  readonly item: LicenseItem;
  readonly key: string;
}

export function OpenSourceLicensesList(): ReactNode {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const sections = LICENSE_GROUPS.filter((g) => g.items.length > 0).map((g) => ({
    id: g.id,
    data: g.items.map((item, i): Row => ({ item, key: licenseKey(g.id, i) })),
  }));

  return (
    <SectionList
      sections={sections}
      keyExtractor={(row) => row.key}
      stickySectionHeadersEnabled={false}
      initialNumToRender={20}
      contentContainerStyle={{ paddingTop: 16, paddingBottom: 48 + insets.bottom }}
      ListHeaderComponent={
        <View style={{ gap: 16, marginBottom: 24 }}>
          <ThemedText variant="bodyMedium" tone="secondary" className="px-4" style={{ lineHeight: 23 }}>
            {t('licenses.intro')}
          </ThemedText>
          <ThemedSurface className="mx-4 overflow-hidden">
            <SettingsBlockRow
              icon="chevron.left.forwardslash.chevron.right"
              title={t('licenses.appSource')}
              subtitle={t('licenses.appSourceSubtitle')}
              onPress={() => { void Linking.openURL(APP_SOURCE_URL); }}
            />
          </ThemedSurface>
        </View>
      }
      renderSectionHeader={({ section }) => (
        <ThemedText variant="bodyMedium" className="px-4" style={{ marginBottom: 8 }}>
          {`${t(`licenses.group.${section.id satisfies LicenseGroupId}`)} · ${section.data.length}`}
        </ThemedText>
      )}
      renderSectionFooter={() => <View style={{ height: 24 }} />}
      renderItem={({ item: row, index, section }) => (
        <LicenseRow row={row} first={index === 0} last={index === section.data.length - 1} />
      )}
    />
  );
}

function LicenseRow({ row, first, last }: { readonly row: Row; readonly first: boolean; readonly last: boolean }): ReactNode {
  const c = useThemeColors();
  const { item } = row;
  const subtitle = item.version ? `${item.version} · ${item.license}` : item.license;
  return (
    <PressableScale
      onPress={() => { router.push({ pathname: '/legal/licenses/[id]', params: { id: row.key } }); }}
      accessibilityRole="button"
      accessibilityLabel={item.name}
      containerStyle={{ marginHorizontal: 16 }}
    >
      <View
        className={`flex-row items-center border-x border-divider bg-cardBg ${first ? 'rounded-t-card border-t' : ''} ${last ? 'rounded-b-card border-b' : ''}`}
        style={{ paddingHorizontal: 14, paddingVertical: 12 }}
      >
        <View className="flex-1" style={{ gap: 2 }}>
          <ThemedText variant="bodyMedium" numberOfLines={1}>{item.name}</ThemedText>
          <ThemedText variant="bodySmall" tone="tertiary" numberOfLines={1}>{subtitle}</ThemedText>
        </View>
        <SfIcon name="chevron.right" size={12} weight="semibold" color={c.text3} />
      </View>
      {last ? null : <View className="border-x border-divider bg-cardBg"><View className="bg-divider" style={{ height: 0.5, marginLeft: 14 }} /></View>}
    </PressableScale>
  );
}
