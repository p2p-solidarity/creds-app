/**
 * SignSeal — the creds.id mark as a signature, shown while the root key signs.
 *
 * `waiting`: the two rings stand a little apart and sway slowly while Face ID is
 * up — the page is not sealed yet. `signed`: they swing shut with the splash's
 * squeeze and the badge turns from the biometric glyph into a check. Only
 * transform and opacity move; Reduce Motion drops the sway and the swing.
 */
import { useEffect, type ReactNode } from 'react';
import { Platform, StyleSheet, View, useColorScheme } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { CREDS_MARK, CREDS_RING } from '@/components/brand/credsLogo';
import { SfIcon } from '@/components/icons/SfIcon';
import { readableTextOn } from '@/components/themed/contrast';
import { Colors } from '@/constants/Colors';
import { EASE_OUT, SPRING, TIMING } from '@/feedback/motion';

/** How far each ring stands open while waiting. */
const OPEN_DEG = 28;
const SWAY_DEG = 5;
/** One way of the waiting sway; the loop alternates. */
const SWAY_MS = 1300;
const BADGE_SIZE_RATIO = 0.3;
/** The splash's lock squeeze. */
const SQUEEZE_MS = 90;

export type SignSealState = 'waiting' | 'signed';

export function SignSeal({ size, state }: { readonly size: number; readonly state: SignSealState }): ReactNode {
  const dark = useColorScheme() === 'dark';
  const reduceMotion = useReducedMotion();
  const lock = useSharedValue(reduceMotion ? 1 : 0);
  const sway = useSharedValue(0);
  const squeeze = useSharedValue(1);
  const signed = useSharedValue(0);

  useEffect(() => {
    if (state === 'waiting') {
      if (reduceMotion) return;
      sway.value = withRepeat(withTiming(1, { duration: SWAY_MS, easing: Easing.inOut(Easing.sin) }), -1, true);
      return;
    }
    cancelAnimation(sway);
    sway.value = withTiming(0, TIMING.fast);
    signed.value = withSpring(1, SPRING.gentle);
    if (reduceMotion) return;
    lock.value = withSpring(1, SPRING.gentle);
    squeeze.value = withSequence(
      withTiming(0.94, { duration: SQUEEZE_MS, easing: EASE_OUT }),
      withSpring(1, SPRING.gentle),
    );
  }, [lock, reduceMotion, signed, squeeze, state, sway]);

  const scale = size / CREDS_MARK.width;
  const ringW = CREDS_RING.width * scale;
  const ringH = CREDS_RING.height * scale;
  const height = CREDS_MARK.height * scale;
  const ink = dark ? Colors.logoInkDark : Colors.logoInk;
  const accent = dark ? Colors.logoAccentDark : Colors.logoAccent;
  const badge = size * BADGE_SIZE_RATIO;

  const markStyle = useAnimatedStyle(() => ({ transform: [{ scale: squeeze.value }] }));
  const ringAStyle = useAnimatedStyle(() => {
    const swing = (lock.value - 1) * OPEN_DEG - sway.value * SWAY_DEG;
    return { transform: [{ rotate: `${String(swing)}deg` }] };
  });
  const ringBStyle = useAnimatedStyle(() => {
    // The second ring is the first turned 180°; it opens to the other side.
    const swing = 180 + (1 - lock.value) * OPEN_DEG + sway.value * SWAY_DEG;
    return { transform: [{ rotate: `${String(swing)}deg` }] };
  });
  const glyphStyle = useAnimatedStyle(() => ({
    opacity: 1 - signed.value,
    transform: [{ scale: 1 - signed.value * 0.4 }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: signed.value,
    transform: [{ scale: 0.6 + signed.value * 0.4 }],
  }));

  return (
    // Decorative: the step's title says what is being signed.
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height }}>
      <Animated.View style={[StyleSheet.absoluteFill, markStyle]}>
        <Animated.View style={[styles.abs, { width: ringW, height: ringH }, ringAStyle]}>
          <Ring width={ringW} height={ringH} color={ink} />
        </Animated.View>
        <Animated.View
          style={[
            styles.abs,
            {
              left: (CREDS_MARK.width - CREDS_RING.width) * scale,
              top: (CREDS_MARK.height - CREDS_RING.height) * scale,
              width: ringW,
              height: ringH,
            },
            ringBStyle,
          ]}>
          <Ring width={ringW} height={ringH} color={accent} />
        </Animated.View>
      </Animated.View>
      <View
        style={[
          styles.badge,
          { width: badge, height: badge, borderRadius: badge / 2, backgroundColor: accent, borderColor: Colors.pageBg },
        ]}>
        <Animated.View style={[styles.center, glyphStyle]}>
          <SfIcon
            name={Platform.OS === 'ios' ? 'faceid' : 'touchid'}
            size={badge * 0.52}
            color={readableTextOn(accent)}
            weight="semibold"
          />
        </Animated.View>
        <Animated.View style={[styles.center, checkStyle]}>
          <SfIcon name="checkmark" size={badge * 0.46} color={readableTextOn(accent)} weight="bold" />
        </Animated.View>
      </View>
    </View>
  );
}

function Ring({
  width,
  height,
  color,
}: {
  readonly width: number;
  readonly height: number;
  readonly color: string;
}): ReactNode {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${String(CREDS_RING.width)} ${String(CREDS_RING.height)}`}>
      <Path d={CREDS_RING.d} fill={color} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: -6, bottom: -6, borderWidth: 3 },
});
