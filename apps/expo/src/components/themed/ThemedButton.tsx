/**
 * ThemedButton — single CTA primitive, the app twin of creds.id's `.btn`
 * (airmeishi-web global.css; the web wins when they disagree).
 *
 *   primary       → `.btn`        ink fill, cream label
 *   inverted      → bg=white, fg=black, NO border (on dark imagery)
 *   secondary     → `.btn-ghost`  card fill, 1pt divider stroke
 *   dottedOutline → bg=clear, fg=primaryBlue, dashed primaryBlue stroke
 *   destructive   → bg=clear, fg=destructive, 1pt destructive stroke
 *
 * Every variant: 6pt corners (`--radius-button`), 16pt medium label (13pt at
 * `sm`, like `.btn-sm`), 14v/24h padding, pressed scale 0.97.
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

import { textFont } from '@/constants/fonts';
import { useThemeColors, type ThemeColors } from '@/constants/useThemeColors';
import { haptic as fireHaptic, type HapticKind } from '@/feedback/haptics';
import { ON_DARK, ON_LIGHT } from './contrast';

export type ButtonVariant =
  | 'primary'
  | 'inverted'
  | 'secondary'
  | 'dottedOutline'
  | 'destructive';

export type ButtonSize = 'sm' | 'md' | 'lg';

/** creds.id `--radius-button`. */
const BUTTON_RADIUS = 6;

/** Vertical padding per Swift (.padding(.vertical, 14)). Height = padding * 2 + line. */
const SIZE_PADDING_Y: Readonly<Record<ButtonSize, number>> = {
  sm: 8,
  md: 14,
  lg: 18,
};
/** Horizontal padding per Swift (.padding(.horizontal, 24)). */
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
    scale.value = withSpring(0.97, { damping: 100, stiffness: 600 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 100, stiffness: 600 });
  };

  const handlePress = (e: GestureResponderEvent) => {
    if (haptic !== false) fireHaptic(haptic ?? DEFAULT_HAPTIC[variant]);
    onPress?.(e);
  };

  const containerStyle = {
    borderRadius: BUTTON_RADIUS,
    backgroundColor: cfg.bg,
    paddingHorizontal: SIZE_PADDING_X[size],
    paddingVertical: SIZE_PADDING_Y[size],
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
            {leadingIcon ? <View style={styles.icon}>{leadingIcon}</View> : null}
            {/* CTA labels are single-line: a long locale string (e.g. English in
                a half-width row) shrinks slightly instead of wrapping, which
                would give side-by-side buttons unequal heights. */}
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              style={{ color: cfg.fg, fontSize: size === 'sm' ? 13 : 16, fontFamily: textFont(cfg.weight) }}>
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
        bg: theme.text1,
        fg: theme.pageBg,
        borderColor: `${theme.text1}4D`,
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
