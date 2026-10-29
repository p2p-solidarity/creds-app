/**
 * ThemedText — primary text primitive. Maps tone (primary/secondary/tertiary/
 * accent/error) to theme tokens; variant (headlineLarge…caption) to the
 * Typography scale.
 *
 * Per CLAUDE.md rule 2: never use raw `<Text style={{ fontSize, fontWeight }}>`.
 * Use this component OR spread a Typography token from constants/.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { displayFont, textFont } from '@/constants/fonts';

export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'error';

export type TextVariant =
  | 'headlineLarge'
  | 'headlineMedium'
  | 'titleLarge'
  | 'titleMedium'
  | 'bodyLarge'
  | 'bodyMedium'
  | 'bodySmall'
  | 'caption'
  | 'label';

const TONE_CLASS: Readonly<Record<TextTone, string>> = {
  primary: 'text-text1',
  secondary: 'text-text2',
  tertiary: 'text-text3',
  accent: 'text-accentRose',
  error: 'text-destructive',
};

// Headlines and titles are DM Sans, the rest Inter (constants/fonts.ts), with the
// Figma tracking: -2% on headings, -1% on text.
const VARIANT_STYLE: Readonly<Record<TextVariant, TextStyle>> = {
  headlineLarge: { fontSize: 32, fontWeight: '700', lineHeight: 40, letterSpacing: -0.64 },
  headlineMedium: { fontSize: 24, fontWeight: '700', lineHeight: 32, letterSpacing: -0.48 },
  titleLarge: { fontSize: 20, fontWeight: '600', lineHeight: 28, letterSpacing: -0.4 },
  titleMedium: { fontSize: 17, fontWeight: '600', lineHeight: 24, letterSpacing: -0.17 },
  bodyLarge: { fontSize: 17, fontWeight: '400', lineHeight: 24, letterSpacing: -0.17 },
  bodyMedium: { fontSize: 15, fontWeight: '400', lineHeight: 22, letterSpacing: -0.15 },
  bodySmall: { fontSize: 13, fontWeight: '400', lineHeight: 18, letterSpacing: -0.13 },
  caption: { fontSize: 12, fontWeight: '500', lineHeight: 16 },
  label: { fontSize: 13, fontWeight: '600', lineHeight: 18, letterSpacing: -0.13 },
};

const DISPLAY: ReadonlySet<TextVariant> = new Set(['headlineLarge', 'headlineMedium', 'titleLarge', 'titleMedium']);

/**
 * The variant, then the caller's style, with the weight turned into a family: a
 * caller's `fontWeight` picks the matching face, a caller's `fontFamily` (MONO)
 * wins outright.
 */
export function typeStyle(variant: TextVariant, style?: TextProps['style']): TextStyle {
  const merged = StyleSheet.flatten([VARIANT_STYLE[variant], style]);
  if (merged.fontFamily !== undefined) return merged;
  const fontFamily = DISPLAY.has(variant) ? displayFont(merged.fontWeight) : textFont(merged.fontWeight);
  return { ...merged, fontFamily, fontWeight: undefined };
}

/** Fixed-width figures so live-updating numbers don't reflow their neighbours. */
const TABULAR_STYLE: TextStyle = { fontVariant: ['tabular-nums'] };

export interface ThemedTextProps extends Omit<TextProps, 'children'> {
  readonly variant?: TextVariant;
  readonly tone?: TextTone;
  /** Equal-width figures (`tabular-nums`) for numbers that update in place. */
  readonly tabularNums?: boolean;
  readonly children: ReactNode;
}

export function ThemedText({
  variant = 'bodyMedium',
  tone = 'primary',
  tabularNums = false,
  className,
  style,
  children,
  ...rest
}: ThemedTextProps): ReactNode {
  const tw = `${TONE_CLASS[tone]} ${className ?? ''}`.trim();
  return (
    <Text
      className={tw}
      style={[typeStyle(variant, style), tabularNums ? TABULAR_STYLE : null]}
      {...rest}
    >
      {children}
    </Text>
  );
}
