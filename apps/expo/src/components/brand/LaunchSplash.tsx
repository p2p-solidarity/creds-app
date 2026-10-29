/**
 * LaunchSplash — the creds.id logo assembling itself, played once as the app opens.
 *
 * On the native splash's own ground (app.json), the mark's two rings swing in from
 * opposite sides on a soft spring and lock into each other with one small squeeze;
 * "creds.id" slides in beside them, and the two accent dots — the full stop and the
 * i's tittle — drop into place last with a little bounce. Then the whole logo lifts a
 * hair and fades into the app. Only transform and opacity move.
 *
 * The first JS frame is the bare ground, so it continues the native splash with no
 * jump. Under Reduce Motion the finished logo simply holds and fades.
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
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
const EXIT_AT_MS = 1400;
const REDUCED_MOTION_HOLD_MS = 150;
const FINISH_TIMEOUT_MS = 2400;

/** A drop with a visible bounce — the dots are the logo's one playful beat. */
const DOT_SPRING = { damping: 9, stiffness: 260, mass: 0.8 } as const;

export function LaunchSplash({
  onFinished,
  onHideError,
}: {
  readonly onFinished: () => void;
  readonly onHideError: (error: unknown) => void;
}): ReactNode {
  const reduceMotion = useReducedMotion();
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
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onFinishedRef.current();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(finish, FINISH_TIMEOUT_MS);
    return () => {
      clearTimeout(timeout);
    };
  }, [finish]);

  useEffect(() => {
    const exitAt = reduceMotion ? REDUCED_MOTION_HOLD_MS : EXIT_AT_MS;

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
      lift.value = withDelay(exitAt, withTiming(1.04, { duration: DURATION.enter, easing: EASE_OUT }));
    }

    scene.value = withDelay(
      exitAt,
      withTiming(0, { duration: DURATION.enter, easing: EASE_OUT }, (didFinish) => {
        if (didFinish) scheduleOnRN(finish);
      }),
    );
  }, [dots, finish, lift, reduceMotion, ringA, ringB, scene, squeeze, text]);

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
    requestAnimationFrame(() => {
      void SplashScreen.hideAsync().catch(onHideError);
    });
  };

  const textBox = {
    left: CREDS_LOCKUP.text.x * k,
    top: 0,
    width: CREDS_LOCKUP.text.width * k,
    height: CREDS_LOCKUP.height * k,
  };
  const textViewBox = `${String(CREDS_LOCKUP.text.x)} 0 ${String(CREDS_LOCKUP.text.width)} ${String(CREDS_LOCKUP.height)}`;
  const ink = Colors.logoInk;
  const accent = Colors.logoAccent;

  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={hideNativeSplashAfterFirstFrame}
      style={[styles.fill, { backgroundColor: Colors.splashBg }, sceneStyle]}
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
