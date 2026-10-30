/**
 * The verification seal — the app twin of creds.id's `.seal` pill
 * (airmeishi-web global.css): a rounded pill whose state is the whole trust
 * claim of the row it sits in.
 *
 *   verified     green tint, contrast-safe green ink, check seal
 *   needsRecheck amber outline — the evidence aged out or the live check failed
 *   declared     neutral outline — claimed, not proven (never a green check)
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { useThemeColors } from '@/constants/useThemeColors';
import { Radius } from '@/constants/radius';

export type SealState = 'verified' | 'needsRecheck' | 'declared';

export function SealPill({ state, label }: { readonly state: SealState; readonly label: string }): ReactNode {
  const c = useThemeColors();
  const ink = state === 'verified' ? c.terminalGreenText : state === 'needsRecheck' ? c.warningText : c.text2;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 5,
        paddingHorizontal: 11,
        borderRadius: Radius.pill,
        borderWidth: 1,
        borderColor: state === 'verified' ? Colors.terminalGreenBorder : state === 'needsRecheck' ? ink : c.divider,
        backgroundColor: state === 'verified' ? Colors.terminalGreenBg : 'transparent',
      }}>
      {state === 'declared' ? null : (
        <SfIcon name={state === 'verified' ? 'checkmark.seal.fill' : 'clock'} size={12} color={ink} />
      )}
      <ThemedText variant="caption" numberOfLines={1} style={{ color: ink }}>
        {label}
      </ThemedText>
    </View>
  );
}
