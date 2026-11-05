/**
 * ThemedSwitch — the one on/off control. The accent track and light thumb
 * match the creds.id web toggles (never iOS system green), and on iOS the
 * Liquid Glass switch is drawn a size down so it sits with 15pt row text
 * instead of towering over it.
 */
import type { ReactNode } from 'react';
import { Platform, Switch } from 'react-native';

import { Colors } from '@/constants/Colors';
import { useThemeColors } from '@/constants/useThemeColors';

import { ON_DARK } from './contrast';

const IOS_SCALE = 0.85;

export interface ThemedSwitchProps {
  readonly value: boolean;
  readonly onValueChange: (next: boolean) => void;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
}

export function ThemedSwitch({ value, onValueChange, disabled = false, accessibilityLabel, accessibilityHint }: ThemedSwitchProps): ReactNode {
  const c = useThemeColors();
  return (
    <Switch
      style={{ alignSelf: 'center', ...(Platform.OS === 'ios' ? { transform: [{ scale: IOS_SCALE }] } : {}) }}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      trackColor={{ false: c.divider, true: Colors.primaryBlue }}
      // A light thumb in both modes, as iOS draws it; the card colour went
      // near-black in dark mode and read as a hole in the track.
      thumbColor={ON_DARK}
      ios_backgroundColor={c.divider}
    />
  );
}
