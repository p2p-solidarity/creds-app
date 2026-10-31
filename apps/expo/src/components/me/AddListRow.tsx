/**
 * The add sheet's list — Linktree's "Suggested" rows: a round badge (a brand's
 * colour, or a tinted glyph), a title and a one-line description, hairlines
 * between rows. Shared by the Page add sheet and the add-link flow's platform
 * list, so both scroll as one vertical list instead of a grid of squares.
 */
import type { SFSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { BrandBadge, type BrandBadgeName } from '@/components/icons/BrandBadge';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedText } from '@/components/themed';
import { Radius } from '@/constants/radius';
import { useThemeColors } from '@/constants/useThemeColors';

import { PageSectionLabel } from './PageSectionLabel';

/** One row of the list: a platform, a section type, or the import entry. */
export interface AddRow {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  /** Extra words the search matches (host names, English names). */
  readonly keywords: string;
  readonly badge: BrandBadgeName | null;
  readonly icon?: SFSymbol;
  readonly pro?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}

export function RowGroup({
  title,
  note = null,
  rows,
}: {
  readonly title: string;
  readonly note?: string | null;
  readonly rows: readonly AddRow[];
}): ReactNode {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <PageSectionLabel title={title} />
        </View>
        {note !== null ? (
          <ThemedText variant="caption" tone="tertiary" numberOfLines={1}>{note}</ThemedText>
        ) : null}
      </View>
      {rows.map((row, index) => <ListRow key={row.key} row={row} divided={index < rows.length - 1} />)}
    </View>
  );
}

/** Badge, title, one-line description; a hairline under every row but the last. */
export function ListRow({ row, divided = false }: { readonly row: AddRow; readonly divided?: boolean }): ReactNode {
  const c = useThemeColors();
  const disabled = row.disabled === true;
  return (
    <PressableScale
      haptic={disabled ? false : 'tap'}
      disabled={disabled}
      onPress={row.onPress}
      accessibilityRole="button"
      accessibilityLabel={row.pro ? `${row.title}, PRO` : row.title}
      accessibilityHint={row.description}
      accessibilityState={{ disabled }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, opacity: disabled ? 0.4 : 1 }}>
      {row.badge !== null ? (
        <BrandBadge name={row.badge} size={44} />
      ) : (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: Radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.chipSurface,
          }}>
          {row.icon ? <SfIcon name={row.icon} size={20} color={c.primaryBlue} /> : null}
        </View>
      )}
      <View
        style={{
          flex: 1,
          gap: 2,
          alignSelf: 'stretch',
          justifyContent: 'center',
          paddingVertical: 14,
          borderBottomWidth: divided ? 1 : 0,
          borderBottomColor: c.divider,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ThemedText variant="titleMedium" numberOfLines={1} style={{ flexShrink: 1 }}>{row.title}</ThemedText>
          {row.pro ? (
            <View style={{ paddingHorizontal: 6, borderRadius: Radius.pill, backgroundColor: c.chipSurface }}>
              <ThemedText variant="caption" style={{ color: c.primaryBlue, letterSpacing: 0.6 }}>PRO</ThemedText>
            </View>
          ) : null}
        </View>
        <ThemedText variant="bodySmall" tone="secondary" numberOfLines={1}>{row.description}</ThemedText>
      </View>
    </PressableScale>
  );
}
