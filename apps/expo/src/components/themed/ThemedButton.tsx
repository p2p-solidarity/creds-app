/**
 * ThemedButton — single CTA primitive, the app twin of creds.id's `.btn`
 * (airmeishi-web global.css; the web wins when they disagree).
 *
 *   primary       → `.btn`        `--color-inverted` fill: ink by day, cream by night
 *   inverted      → bg=white, fg=black, NO border (on dark imagery)
 *   secondary     → `.btn-ghost`  card fill, 1pt divider stroke
 *   dottedOutline → bg=clear, fg=primaryBlue, dashed primaryBlue stroke
 *   destructive   → bg=clear, fg=destructive, 1pt destructive stroke
 *
 * Every variant: 6pt corners (`--radius-button`), 16pt medium label (13pt at
 * `sm`, like `.btn-sm`), pressed scale 0.97. Height is FIXED per size — 36 /
 * 48 / 56, the web's `.btn-sm` and the editor's 48pt control line — so an
 * icon, a spinner or a shrunk label never makes two buttons differ. Pass
 * `icon` (an SF Symbol) rather than a hand-coloured `leadingIcon`: the glyph
 * then takes the label's colour in either theme.
 *
 * Haptic policy (aniseekr CLAUDE rule 7):
 *   primary/inverted/destructive → heavyImpact (Swift)
 *   secondary/dottedOutline      → rigidImpact / tap
 * Override with `haptic="…"` or `haptic={false}`.
 */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { SFSymbol } from 'expo-symbols';

import { SfIcon } from '@/components/icons/SfIcon';
import { textFont } from '@/constants/fonts';
import { useThemeColors, type ThemeColors } from '@/constants/useThemeColors';
import { haptic as fireHaptic, type HapticKind } from '@/feedback/haptics';
import { ON_DARK, ON_LIGHT } from './contrast';
import { Radius } from '@/constants/radius';
import { SCALE, SPRING } from '@/feedback/motion';

export type ButtonVariant =
  | 'primary'
  | 'inverted'
  | 'secondary'
  | 'dottedOutline'
  | 'destructive';

export type ButtonSize = 'sm' | 'md' | 'lg';

/** creds.id `--radius-button`. */
const BUTTON_RADIUS = Radius.button;

/** One control height per size: `.btn-sm` 36, the editor's 48 line, a hero 56. */
const SIZE_HEIGHT: Readonly<Record<ButtonSize, number>> = {
  sm: 36,
  md: 48,
  lg: 56,
};
const SIZE_ICON: Readonly<Record<ButtonSize, number>> = {
  sm: 13,
  md: 16,
  lg: 17,
};
/** `.btn` 24 / `.btn-sm` 14 side padding. */
const SIZE_PADDING_X: Readonly<Record<ButtonSize, number>> = {
  sm: 14,
  md: 24,
  lg: 28,
};

interface VariantStyle {
  readonly bg: string;
  readonly fg: string;
  readonly borderColor?: string;
  readonly borderWidth: number;
  readonly dashed?: boolean;
  /** Swift font weight per variant. */
  readonly weight: '400' | '500';
}

const DEFAULT_HAPTIC: Readonly<Record<ButtonVariant, HapticKind>> = {
  primary: 'success',
  inverted: 'tap',
  secondary: 'tap',
  dottedOutline: 'tap',
  destructive: 'warning',
};

export interface ThemedButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  readonly label: string;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly fullWidth?: boolean;
  readonly loading?: boolean;
  /** Leading SF Symbol, drawn in the label's colour. */
  readonly icon?: SFSymbol;
  /** A custom leading node (brand glyphs); prefer `icon`. */
  readonly leadingIcon?: ReactNode;
  /** Override the default haptic, or pass `false` to disable. */
  readonly haptic?: HapticKind | false;
}

export function ThemedButton({
  label,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  icon,
  leadingIcon,
  haptic,
  disabled,
  className: _className,
  onPress,
  ...rest
}: ThemedButtonProps): ReactNode {
  const theme = useThemeColors();
  const cfg = variantConfig(variant, theme);
  const unavailable = disabled === true || loading;
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = () => {
    scale.value = withSpring(SCALE.press, SPRING.press);
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, SPRING.press);
  };

  const handlePress = (e: GestureResponderEvent) => {
    if (haptic !== false) fireHaptic(haptic ?? DEFAULT_HAPTIC[variant]);
    onPress?.(e);
  };

  const containerStyle = {
    borderRadius: BUTTON_RADIUS,
    backgroundColor: cfg.bg,
    paddingHorizontal: SIZE_PADDING_X[size],
    height: SIZE_HEIGHT[size],
    borderWidth: cfg.borderWidth,
    borderColor: cfg.borderColor,
    borderStyle: cfg.dashed ? ('dashed' as const) : ('solid' as const),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexDirection: 'row' as const,
    alignSelf: fullWidth ? ('stretch' as const) : ('flex-start' as const),
    opacity: unavailable ? 0.5 : 1,
  };

  return (
    <Animated.View style={[animStyle, fullWidth ? styles.fullWidth : undefined]}>
      <Pressable
        style={containerStyle}
        disabled={unavailable}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        {...rest}
      >
        {loading ? (
          <ActivityIndicator color={cfg.fg} />
        ) : (
          <>
            {icon ? (
              <View style={styles.icon}>
                <SfIcon name={icon} size={SIZE_ICON[size]} color={cfg.fg} weight="medium" />
              </View>
            ) : leadingIcon ? <View style={styles.icon}>{leadingIcon}</View> : null}
            {/* CTA labels are single-line: a long locale string (e.g. English in
                a half-width row) shrinks slightly instead of wrapping, which
                would give side-by-side buttons unequal heights. */}
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              // iOS gives a shrinkable label the full row width and draws it
              // left-aligned; centre it inside its own box too.
              style={{
                color: cfg.fg,
                fontSize: size === 'sm' ? 13 : 16,
                fontFamily: textFont(cfg.weight),
                textAlign: 'center',
                flexShrink: 1,
              }}>
              {label}
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

function variantConfig(variant: ButtonVariant, theme: ThemeColors): VariantStyle {
  switch (variant) {
    case 'primary':
      return {
        bg: theme.invertedButtonBg,
        fg: theme.invertedButtonText,
        borderColor: 'transparent',
        borderWidth: 1,
        weight: '500',
      };
    case 'inverted':
      return {
        bg: ON_DARK,
        fg: ON_LIGHT,
        borderWidth: 0,
        weight: '500',
      };
    case 'secondary':
      return {
        bg: theme.cardBg,
        fg: theme.text1,
        borderColor: theme.divider,
        borderWidth: 1,
        weight: '500',
      };
    case 'dottedOutline':
      return {
        bg: 'transparent',
        fg: theme.primaryBlue,
        borderColor: theme.primaryBlue,
        borderWidth: 1,
        dashed: true,
        weight: '500',
      };
    case 'destructive':
      return {
        bg: 'transparent',
        fg: theme.destructive,
        borderColor: theme.destructive,
        borderWidth: 1,
        weight: '500',
      };
  }
}

const styles = StyleSheet.create({
  fullWidth: { alignSelf: 'stretch' },
  icon: { marginRight: 8 },
});
