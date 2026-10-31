/**
 * A Page group label that folds its group (區塊 / 證明). The tab leads with
 * the hero and the links; everything else stays one row tall until asked for,
 * with a short summary so a folded group still says what is inside.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedText } from '@/components/themed';
import { useThemeColors } from '@/constants/useThemeColors';

import { PageSectionLabel } from './PageSectionLabel';

export function PageCollapsibleHeader({
  title,
  summary,
  open,
  onToggle,
  add,
}: {
  readonly title: string;
  /** What the folded group holds, e.g. 「2 個」; null says nothing. */
  readonly summary: string | null;
  readonly open: boolean;
  readonly onToggle: () => void;
  /** A ＋ beside the fold that adds to this group; `disabled` once full. */
  readonly add?: { readonly label: string; readonly disabled: boolean; readonly onPress: () => void };
}): ReactNode {
  const c = useThemeColors();
  const header = (
    <PressableScale
      haptic="tap"
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={summary === null ? title : `${title}, ${summary}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
      <PageSectionLabel title={title} />
      <View style={{ flex: 1 }}>
        {summary !== null ? (
          <ThemedText variant="caption" tone="tertiary" numberOfLines={1}>
            {summary}
          </ThemedText>
        ) : null}
      </View>
      <SfIcon name={open ? 'chevron.up' : 'chevron.down'} size={13} color={c.text3} />
    </PressableScale>
  );
  if (add === undefined) return header;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ flex: 1 }}>{header}</View>
      <PressableScale
        haptic="tap"
        onPress={add.onPress}
        disabled={add.disabled}
        accessibilityRole="button"
        accessibilityLabel={add.label}
        accessibilityState={{ disabled: add.disabled }}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: add.disabled ? 0.3 : 1 }}>
        <SfIcon name="plus" size={16} color={c.text1} />
      </PressableScale>
    </View>
  );
}
