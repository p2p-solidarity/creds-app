/**
 * One component's row from Settings → Open-source licenses: name, version,
 * declared license, its project page and the full license / notice text it
 * ships with (or, when it ships none, a plain statement of that).
 */
import type { ReactNode } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedButton, ThemedSurface, ThemedText } from '@/components/themed';
import { MONO } from '@/constants/fonts';
import { useTranslation } from '@/i18n';
import { licenseText, type LicenseItem } from '@/legal/licenses';

export function LicenseDetailView({ item }: { readonly item: LicenseItem }): ReactNode {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const text = licenseText(item);
  const url = item.url?.startsWith('https://') === true ? item.url : undefined;

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48 + insets.bottom, gap: 16 }}
    >
      <View style={{ gap: 4 }}>
        <ThemedText variant="titleLarge" selectable>{item.name}</ThemedText>
        <ThemedText variant="bodySmall" tone="tertiary" selectable>
          {item.version ? `${item.version} · ${item.license}` : item.license}
        </ThemedText>
      </View>
      {url ? (
        <ThemedButton variant="secondary" label={t('licenses.openProject')} onPress={() => { void Linking.openURL(url); }} />
      ) : null}
      <ThemedSurface padded>
        {text ? (
          <ThemedText variant="bodySmall" tone="secondary" selectable style={{ fontFamily: MONO, fontSize: 12, lineHeight: 18 }}>
            {text}
          </ThemedText>
        ) : (
          <ThemedText variant="bodyMedium" tone="secondary" style={{ lineHeight: 23 }}>
            {t('licenses.noText', { license: item.license })}
          </ThemedText>
        )}
      </ThemedSurface>
    </ScrollView>
  );
}
