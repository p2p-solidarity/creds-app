/**
 * LaunchSplash — the creds.id logo assembling itself, played once as the app opens.
 *
 * On the native splash's own ground (app.json), the mark's two rings swing in from
 * opposite sides on a soft spring and lock into each other with one small squeeze;
 * "creds.id" slides in beside them, and the two accent dots — the full stop and the
 * i's tittle — drop into place last with a little bounce. Then the whole logo lifts a
 * hair and fades into the app. Only transform and opacity move.
 *
 * Order matters, or the phone plays it where nobody can see it:
 *   1. mounts with the JS bundle, before boot — the first frame is the bare ground
 *      in the native splash's colour (system light/dark), so nothing jumps;
 *   2. the timeline starts only once the native splash has actually hidden;
 *   3. `onSettled` fires when the logo is whole — the root mounts the app under it
 *      then, so the heavy first mount never steals the animation's frames;
 *   4. `appShown` (the app has laid out) starts the lift-and-fade.
 * Under Reduce Motion the finished logo simply holds and fades.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Appearance, StyleSheet, View, useWindowDimensions } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { CREDS_LOCKUP, CREDS_MARK, CREDS_RING } from '@/components/brand/credsLogo';
import { Colors } from '@/constants/Colors';
import { DURATION, EASE_OUT, SPRING } from '@/feedback/motion';

const RINGS_IN_MS = 60;
const RING_STAGGER_MS = 90;
const RING_SWING_DEG = 120;
const LOCK_AT_MS = 560;
const TEXT_IN_MS = 380;
const TEXT_SLIDE_PX = 12;
const DOTS_IN_MS = 720;
const DOTS_DROP_PX = 22;
/** The dots have landed and the logo is whole; the app may mount underneath. */
const SETTLED_AT_MS = 1100;
/** Hold the whole logo this long before the fade even if the app is already there. */
const MIN_HOLD_MS = 1350;
const REDUCED_MOTION_HOLD_MS = 150;
/** hideAsync never answering must not leave the logo unassembled. */
const NATIVE_HIDE_FALLBACK_MS = 800;
/** The fade's completion callback never firing must not leave the splash over the app. */
const EXIT_FALLBACK_MS = DURATION.enter + 600;

/** A drop with a visible bounce — the dots are the logo's one playful beat. */
const DOT_SPRING = { damping: 9, stiffness: 260, mass: 0.8 } as const;

export function LaunchSplash({
  appShown,
  onSettled,
  onFinished,
  onHideError,
}: {
  /** The app has laid out under the splash — fade out. */
  readonly appShown: boolean;
  readonly onSettled: () => void;
  readonly onFinished: () => void;
  readonly onHideError: (error: unknown) => void;
}): ReactNode {
  const reduceMotion = useReducedMotion();
  // The native splash follows the system scheme; so does this, read once — a
  // preference applied during boot must not recolour the logo mid-animation.
  const [dark] = useState(() => Appearance.getColorScheme() === 'dark');
  const { width } = useWindowDimensions();
  const logoWidth = Math.min(width * 0.68, 300);
  const k = logoWidth / CREDS_LOCKUP.width;
  // The mark is drawn in its own frame; the lockup shows it at this scale.
  const markScale = (CREDS_LOCKUP.mark.height / CREDS_MARK.height) * k;
  const ringW = CREDS_RING.width * markScale;
  const ringH = CREDS_RING.height * markScale;

  const ringA = useSharedValue(reduceMotion ? 1 : 0);
  const ringB = useSharedValue(reduceMotion ? 1 : 0);
  const squeeze = useSharedValue(1);
  const text = useSharedValue(reduceMotion ? 1 : 0);
  const dots = useSharedValue(reduceMotion ? 1 : 0);
  const lift = useSharedValue(1);
  const scene = useSharedValue(1);

  const finished = useRef(false);
  const nativeSplashHideScheduled = useRef(false);
  const callbacks = useRef({ onSettled, onFinished, onHideError });
  // The timeline waits for the native splash to be gone.
  const [started, setStarted] = useState(false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    callbacks.current = { onSettled, onFinished, onHideError };
  }, [onSettled, onFinished, onHideError]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    callbacks.current.onFinished();
  }, []);

  const start = useCallback(() => {
    setStarted(true);
  }, []);

  useEffect(() => {
    if (!started) return;
    if (!reduceMotion) {
      ringA.value = withDelay(RINGS_IN_MS, withSpring(1, SPRING.gentle));
      ringB.value = withDelay(RINGS_IN_MS + RING_STAGGER_MS, withSpring(1, SPRING.gentle));
      squeeze.value = withDelay(
        LOCK_AT_MS,
        withSequence(
          withTiming(0.94, { duration: 90, easing: EASE_OUT }),
          withSpring(1, SPRING.zoom),
        ),
      );
      text.value = withDelay(TEXT_IN_MS, withTiming(1, { duration: DURATION.enter, easing: EASE_OUT }));
      dots.value = withDelay(DOTS_IN_MS, withSpring(1, DOT_SPRING));
    }
    const settled = setTimeout(() => {
      callbacks.current.onSettled();
    }, reduceMotion ? 0 : SETTLED_AT_MS);
    const hold = setTimeout(() => {
      setHeld(true);
    }, reduceMotion ? REDUCED_MOTION_HOLD_MS : MIN_HOLD_MS);
    return () => {
      clearTimeout(settled);
      clearTimeout(hold);
    };
  }, [dots, reduceMotion, ringA, ringB, squeeze, started, text]);

  useEffect(() => {
    if (!appShown || !held) return;
    if (!reduceMotion) lift.value = withTiming(1.04, { duration: DURATION.enter, easing: EASE_OUT });
    scene.value = withTiming(0, { duration: DURATION.enter, easing: EASE_OUT }, (didFinish) => {
      if (didFinish) scheduleOnRN(finish);
    });
    const fallback = setTimeout(finish, EXIT_FALLBACK_MS);
    return () => {
      clearTimeout(fallback);
    };
  }, [appShown, finish, held, lift, reduceMotion, scene]);

  const sceneStyle = useAnimatedStyle(() => ({ opacity: scene.value }));
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: lift.value }] }));
  const markStyle = useAnimatedStyle(() => ({ transform: [{ scale: squeeze.value }] }));
  const ringAStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, ringA.value * 1.6),
    transform: [
      { rotate: `${String((ringA.value - 1) * RING_SWING_DEG)}deg` },
      { scale: 0.8 + ringA.value * 0.2 },
    ],
  }));
  const ringBStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, ringB.value * 1.6),
    transform: [
      // The second ring is the first turned 180°; it swings in from the other side.
      { rotate: `${String(180 + (1 - ringB.value) * RING_SWING_DEG)}deg` },
      { scale: 0.8 + ringB.value * 0.2 },
    ],
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: text.value,
    transform: [{ translateX: (text.value - 1) * TEXT_SLIDE_PX }],
  }));
  const dotsStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, dots.value * 2),
    transform: [{ translateY: (dots.value - 1) * DOTS_DROP_PX }],
  }));

  const hideNativeSplashAfterFirstFrame = () => {
    if (nativeSplashHideScheduled.current) return;
    nativeSplashHideScheduled.current = true;
    setTimeout(start, NATIVE_HIDE_FALLBACK_MS);
    requestAnimationFrame(() => {
      SplashScreen.hideAsync().then(start, (error: unknown) => {
        callbacks.current.onHideError(error);
        start();
      });
    });
  };

  const textBox = {
    left: CREDS_LOCKUP.text.x * k,
    top: 0,
    width: CREDS_LOCKUP.text.width * k,
    height: CREDS_LOCKUP.height * k,
  };
  const textViewBox = `${String(CREDS_LOCKUP.text.x)} 0 ${String(CREDS_LOCKUP.text.width)} ${String(CREDS_LOCKUP.height)}`;
  const ink = dark ? Colors.logoInkDark : Colors.logoInk;
  const accent = dark ? Colors.logoAccentDark : Colors.logoAccent;

  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={hideNativeSplashAfterFirstFrame}
      style={[styles.fill, { backgroundColor: dark ? Colors.splashBgDark : Colors.splashBg }, sceneStyle]}
    >
      <View style={styles.center}>
        <Animated.View style={[{ width: logoWidth, height: CREDS_LOCKUP.height * k }, logoStyle]}>
          <Animated.View
            style={[
              styles.abs,
              { width: CREDS_LOCKUP.mark.width * k, height: CREDS_LOCKUP.mark.height * k },
              markStyle,
            ]}
          >
            <Animated.View style={[styles.abs, { width: ringW, height: ringH }, ringAStyle]}>
              <Ring width={ringW} height={ringH} color={ink} />
            </Animated.View>
            <Animated.View
              style={[
                styles.abs,
                {
                  left: (CREDS_MARK.width - CREDS_RING.width) * markScale,
                  top: (CREDS_MARK.height - CREDS_RING.height) * markScale,
                  width: ringW,
                  height: ringH,
                },
                ringBStyle,
              ]}
            >
              <Ring width={ringW} height={ringH} color={accent} />
            </Animated.View>
          </Animated.View>

          <Animated.View style={[styles.abs, textBox, textStyle]}>
            <Svg width={textBox.width} height={textBox.height} viewBox={textViewBox}>
              <Path d={CREDS_LOCKUP.letters} fill={ink} />
            </Svg>
          </Animated.View>
          <Animated.View style={[styles.abs, textBox, dotsStyle]}>
            <Svg width={textBox.width} height={textBox.height} viewBox={textViewBox}>
              <Path d={CREDS_LOCKUP.dots} fill={accent} />
            </Svg>
          </Animated.View>
        </Animated.View>
      </View>
    </Animated.View>
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
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  center: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  abs: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
