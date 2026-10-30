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
}: {
  readonly title: string;
  /** What the folded group holds, e.g. 「2 個」; null says nothing. */
  readonly summary: string | null;
  readonly open: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  const c = useThemeColors();
  return (
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
}
