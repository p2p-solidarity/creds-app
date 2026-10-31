/**
 * CredsMark — the creds.id two-ring mark (credsLogo.ts), ink + accent from the
 * logo tokens so it follows light/dark. `float` adds the same slow idle bob
 * the feature art uses (`IDLE`); Reduce Motion holds it still.
 */
import { useEffect, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { CREDS_MARK } from '@/components/brand/credsLogo';
import { Colors } from '@/constants/Colors';
import { IDLE } from '@/feedback/motion';

export function CredsMark({ size, float = false }: { readonly size: number; readonly float?: boolean }): ReactNode {
  const dark = useColorScheme() === 'dark';
  const reduceMotion = useReducedMotion();
  const bob = useSharedValue(0);

  useEffect(() => {
    if (!float || reduceMotion) return;
    bob.value = withRepeat(withTiming(1, { duration: IDLE.bobMs, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [bob, float, reduceMotion]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -bob.value * IDLE.bobPx }] }));
  const height = (size * CREDS_MARK.height) / CREDS_MARK.width;

  return (
    <Animated.View
      style={style}
      accessible
      accessibilityRole="image"
      accessibilityLabel="creds.id">
      <Svg width={size} height={height} viewBox={`0 0 ${String(CREDS_MARK.width)} ${String(CREDS_MARK.height)}`}>
        <Path d={CREDS_MARK.ink} fill={dark ? Colors.logoInkDark : Colors.logoInk} />
        <Path d={CREDS_MARK.accent} fill={dark ? Colors.logoAccentDark : Colors.logoAccent} />
      </Svg>
    </Animated.View>
  );
}
