/**
 * ThemedChoiceChip — one option of a pick-one row (template, font, section
 * style). The `.btn-sm` geometry — 36pt high, `--radius-button`, 13pt label —
 * so a row of chips lines up with the small buttons beside it; the selected
 * chip takes the primary edge and the chip tint.
 */
import type { ReactNode } from 'react';

import { PressableScale } from '@/components/common/PressableScale';
import { Radius } from '@/constants/radius';
import { useThemeColors } from '@/constants/useThemeColors';

import { ThemedText } from './ThemedText';

export function ThemedChoiceChip({
  label,
  selected,
  pro = false,
  onPress,
}: {
  readonly label: string;
  readonly selected: boolean;
  /** Mark an option only a Pro plan can pick. */
  readonly pro?: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const c = useThemeColors();
  return (
    <PressableScale
      haptic="tap"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={pro ? `${label}, PRO` : label}
      accessibilityState={{ selected }}
      style={{
        height: 36,
        minWidth: 64,
        paddingHorizontal: 14,
        borderRadius: Radius.button,
        borderWidth: 1,
        borderColor: selected ? c.primaryBlue : c.divider,
        backgroundColor: selected ? c.chipSurface : c.cardBg,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <ThemedText variant="bodySmall" style={{ color: selected ? c.primaryBlue : c.text1 }}>
        {label}
        {pro ? ' · PRO' : ''}
      </ThemedText>
    </PressableScale>
  );
}
