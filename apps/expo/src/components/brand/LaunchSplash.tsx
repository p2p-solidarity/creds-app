/**
 * LaunchSplash — the creds.id home hero, played once as the app opens.
 *
 * The same lighthouse the web door draws (lighthouseArt.ts): its six slices drop
 * onto the plinth one by one on a soft spring over a cream sky with three aurora
 * blooms, then the lantern ignites — the unlit glass fades out, a butter halo
 * swells, one ray sweeps across and the sky flashes — and the whole scene lifts
 * a hair and fades into the app. Only transform and opacity move.
 *
 * The native splash is the bare sky colour (app.json), so the first JS frame
 * continues it with no jump. Under Reduce Motion the lit tower simply holds and
 * fades.
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop, LinearGradient, SvgXml } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { LIGHTHOUSE_SLICES, LIGHTHOUSE_UNLIT } from '@/components/brand/lighthouseArt';
import { Colors } from '@/constants/Colors';
import { DURATION, EASE_OUT, SPRING } from '@/feedback/motion';

/** The art's frame and the lantern's centre in it (airmeishi-web HomeHero `LAMP`). */
const ART_FRAME = 480;
const LAMP_X = 240 / ART_FRAME;
const LAMP_Y = 153.6 / ART_FRAME;

const SKY_IN_MS = 360;
const DROP_START_MS = 60;
const DROP_STEP_MS = 80;
const DROP_RISE_PX = 36;
const IGNITE_AT_MS = 820;
const EXIT_AT_MS = 1320;
const REDUCED_MOTION_HOLD_MS = 150;
const FINISH_TIMEOUT_MS = 2400;

export function LaunchSplash({
  onFinished,
  onHideError,
}: {
  readonly onFinished: () => void;
  readonly onHideError: (error: unknown) => void;
}): ReactNode {
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const tower = Math.min(width * 0.86, 380);

  const sky = useSharedValue(reduceMotion ? 1 : 0);
  const unlit = useSharedValue(reduceMotion ? 0 : 1);
  const halo = useSharedValue(reduceMotion ? 1 : 0);
  const ray = useSharedValue(0);
  const flash = useSharedValue(0);
  const lift = useSharedValue(1);
  const scene = useSharedValue(1);
  // One drop value per slice: 0 = resting on the stack, 1 = above it, unseen.
  const d0 = useSharedValue(reduceMotion ? 0 : 1);
  const d1 = useSharedValue(reduceMotion ? 0 : 1);
  const d2 = useSharedValue(reduceMotion ? 0 : 1);
  const d3 = useSharedValue(reduceMotion ? 0 : 1);
  const d4 = useSharedValue(reduceMotion ? 0 : 1);
  const d5 = useSharedValue(reduceMotion ? 0 : 1);
  const slices = [
    { xml: LIGHTHOUSE_SLICES[0], unlitXml: LIGHTHOUSE_UNLIT[0], drop: d0 },
    { xml: LIGHTHOUSE_SLICES[1], unlitXml: LIGHTHOUSE_UNLIT[1], drop: d1 },
    { xml: LIGHTHOUSE_SLICES[2], unlitXml: LIGHTHOUSE_UNLIT[2], drop: d2 },
    { xml: LIGHTHOUSE_SLICES[3], unlitXml: LIGHTHOUSE_UNLIT[3], drop: d3 },
    { xml: LIGHTHOUSE_SLICES[4], unlitXml: LIGHTHOUSE_UNLIT[4], drop: d4 },
    { xml: LIGHTHOUSE_SLICES[5], unlitXml: LIGHTHOUSE_UNLIT[5], drop: d5 },
  ];

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
      sky.value = withTiming(1, { duration: SKY_IN_MS, easing: EASE_OUT });
      [d0, d1, d2, d3, d4, d5].forEach((drop, i) => {
        drop.value = withDelay(DROP_START_MS + i * DROP_STEP_MS, withSpring(0, SPRING.gentle));
      });
      unlit.value = withDelay(IGNITE_AT_MS, withTiming(0, { duration: DURATION.press, easing: EASE_OUT }));
      halo.value = withDelay(IGNITE_AT_MS, withSpring(1, SPRING.zoom));
      ray.value = withDelay(IGNITE_AT_MS, withTiming(1, { duration: 520, easing: EASE_OUT }));
      flash.value = withDelay(
        IGNITE_AT_MS,
        withSequence(
          withTiming(1, { duration: 90, easing: EASE_OUT }),
          withTiming(0, { duration: 420, easing: EASE_OUT }),
        ),
      );
      lift.value = withDelay(exitAt, withTiming(1.05, { duration: DURATION.enter, easing: EASE_OUT }));
    }

    scene.value = withDelay(
      exitAt,
      withTiming(0, { duration: DURATION.enter, easing: EASE_OUT }, (didFinish) => {
        if (didFinish) scheduleOnRN(finish);
      }),
    );
  }, [d0, d1, d2, d3, d4, d5, finish, flash, halo, lift, ray, reduceMotion, scene, sky, unlit]);

  const sceneStyle = useAnimatedStyle(() => ({ opacity: scene.value }));
  const skyStyle = useAnimatedStyle(() => ({ opacity: sky.value }));
  const towerStyle = useAnimatedStyle(() => ({ transform: [{ scale: lift.value }] }));
  const unlitStyle = useAnimatedStyle(() => ({ opacity: unlit.value }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: halo.value * 0.85,
    transform: [{ scale: 0.4 + halo.value * 0.6 }],
  }));
  const rayStyle = useAnimatedStyle(() => ({
    // Grows out from the lamp, then thins away — one sweep, not a loop.
    opacity: ray.value < 0.35 ? ray.value / 0.35 : 1 - (ray.value - 0.35) / 0.65,
    transform: [{ scaleX: 0.1 + ray.value * 0.9 }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.5 }));

  const hideNativeSplashAfterFirstFrame = () => {
    if (nativeSplashHideScheduled.current) return;
    nativeSplashHideScheduled.current = true;
    requestAnimationFrame(() => {
      void SplashScreen.hideAsync().catch(onHideError);
    });
  };

  const lampLeft = tower * LAMP_X;
  const lampTop = tower * LAMP_Y;
  const haloSize = tower * 0.62;
  const rayWidth = width * 1.4;

  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={hideNativeSplashAfterFirstFrame}
      style={[styles.fill, { backgroundColor: Colors.splashBg }, sceneStyle]}
    >
      <Animated.View style={[styles.fill, skyStyle]}>
        <Aurora width={width} height={height} />
      </Animated.View>
      <Animated.View
        style={[styles.fill, { backgroundColor: Colors.splashLampLight }, flashStyle]}
      />

      <View style={styles.center}>
        <Animated.View style={[{ width: tower, height: tower }, towerStyle]}>
          {slices.map(({ xml, unlitXml, drop }, i) => (
            <Slice key={i} drop={drop} size={tower}>
              <SvgXml xml={xml} width={tower} height={tower} />
              {unlitXml ? (
                <Animated.View style={[styles.fill, unlitStyle]}>
                  <SvgXml xml={unlitXml} width={tower} height={tower} />
                </Animated.View>
              ) : null}
            </Slice>
          ))}

          <Animated.View
            style={[
              styles.abs,
              {
                left: lampLeft - rayWidth / 2,
                top: lampTop - 2,
                width: rayWidth,
                height: 4,
              },
              rayStyle,
            ]}
          >
            <Svg width={rayWidth} height={4}>
              <Defs>
                <LinearGradient id="ray" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={Colors.splashLampLight} stopOpacity={0} />
                  <Stop offset="0.5" stopColor={Colors.splashLampLight} stopOpacity={1} />
                  <Stop offset="1" stopColor={Colors.splashLampLight} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Rect width={rayWidth} height={4} fill="url(#ray)" />
            </Svg>
          </Animated.View>

          <Animated.View
            style={[
              styles.abs,
              {
                left: lampLeft - haloSize / 2,
                top: lampTop - haloSize / 2,
                width: haloSize,
                height: haloSize,
              },
              haloStyle,
            ]}
          >
            <Svg width={haloSize} height={haloSize}>
              <Defs>
                <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={Colors.splashLampLight} stopOpacity={0.95} />
                  <Stop offset="0.35" stopColor={Colors.splashLampLight} stopOpacity={0.4} />
                  <Stop offset="1" stopColor={Colors.splashLampLight} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={haloSize / 2} cy={haloSize / 2} r={haloSize / 2} fill="url(#halo)" />
            </Svg>
          </Animated.View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

function Slice({
  drop,
  size,
  children,
}: {
  readonly drop: SharedValue<number>;
  readonly size: number;
  readonly children: ReactNode;
}): ReactNode {
  const style = useAnimatedStyle(() => ({
    opacity: 1 - drop.value,
    transform: [{ translateY: -drop.value * DROP_RISE_PX }],
  }));
  return <Animated.View style={[styles.abs, { width: size, height: size }, style]}>{children}</Animated.View>;
}

/** The hero's three soft blooms: peach top-left, lilac top-right, butter low centre. */
function Aurora({ width, height }: { readonly width: number; readonly height: number }): ReactNode {
  const m = Math.max(width, height);
  const blooms = [
    { id: 'peach', color: Colors.splashAuroraPeach, cx: width * 0.1, cy: height * 0.05, r: m * 0.5 },
    { id: 'lilac', color: Colors.splashAuroraLilac, cx: width * 0.95, cy: height * 0.3, r: m * 0.45 },
    { id: 'butter', color: Colors.splashAuroraButter, cx: width * 0.45, cy: height * 0.62, r: m * 0.3 },
  ];
  return (
    <Svg width={width} height={height}>
      <Defs>
        {blooms.map((b) => (
          <RadialGradient key={b.id} id={b.id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={b.color} stopOpacity={1} />
            <Stop offset="1" stopColor={b.color} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      {blooms.map((b) => (
        <Circle key={b.id} cx={b.cx} cy={b.cy} r={b.r} fill={`url(#${b.id})`} />
      ))}
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
