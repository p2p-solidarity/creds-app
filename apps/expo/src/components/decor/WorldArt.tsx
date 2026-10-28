/**
 * WorldArt — a little creds.id world on its own patch of sky, the way the web
 * stages its drawn worlds (airmeishi-web LandWorld on `/app`): the brand sky as
 * a soft radial glow that fades into the page, a scatter of four-point sparkles
 * and dots in the four star tones that breathe out of step, and — on the larger
 * stages — two of the web's own small planets drifting off the rim.
 *
 * The centre piece is one of five illustrations drawn with gpt-image-2.5 in the
 * web illustration library's style (pastel striped planets, the cream
 * lighthouse), on a transparent ground. Every layer fades up on arrival, then
 * floats and leans a little on its own period (motion.ts `IDLE`). Transform and
 * opacity only; under Reduce Motion everything simply appears and stays still.
 * Decoration only — hidden from assistive tech, never in a touch's way.
 */
import { Image } from 'expo-image';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';

import { Colors } from '@/constants/Colors';
import { EASE_OUT, IDLE } from '@/feedback/motion';

const ART = {
  welcome: require('../../../assets/art/welcome.webp') as number,
  ready: require('../../../assets/art/ready.webp') as number,
  people: require('../../../assets/art/people.webp') as number,
  page: require('../../../assets/art/page.webp') as number,
  verify: require('../../../assets/art/verify.webp') as number,
} as const;

/** The web's launch-kit planets (O-10 and O-05d), with their aspect ratios. */
const COMPANIONS = [
  { src: require('../../../assets/art/planet-small.webp') as number, x: -0.2, y: 0.66, w: 0.2, ratio: 116 / 104, bobMs: 5400, sway: -2 },
  { src: require('../../../assets/art/planet-flag.webp') as number, x: 1.04, y: 0.04, w: 0.19, ratio: 153 / 116, bobMs: 8600, sway: 1.6 },
] as const;

type Tone = 0 | 1 | 2 | 3;
/** x, y (in the art's box, 0–1, may spill past it), radius as a share of the box,
 * sparkle or dot, tone, and — for the ones that breathe — a phase step. */
type Star = readonly [x: number, y: number, r: number, kind: 's' | 'd', tone: Tone, twinkle?: number];
const STARS: readonly Star[] = [
  [-0.08, 0.16, 0.034, 's', 0, 1],
  [1.06, 0.36, 0.028, 's', 3, 2],
  [0.9, 0.92, 0.038, 's', 0, 3],
  [-0.1, 0.9, 0.022, 's', 2, 4],
  [0.16, -0.04, 0.011, 'd', 1],
  [0.74, -0.08, 0.01, 'd', 2, 5],
  [1.14, 0.7, 0.011, 'd', 3],
  [-0.2, 0.42, 0.01, 'd', 1, 6],
  [0.46, 1.06, 0.01, 'd', 2],
];

export type WorldArtName = keyof typeof ART;

export function WorldArt({
  name,
  size,
  companions = size >= 180,
}: {
  readonly name: WorldArtName;
  readonly size: number;
  /** The two drifting planets; off by default on small stages, where they crowd. */
  readonly companions?: boolean;
}): ReactNode {
  const sky = size * 1.9;

  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Arrive index={0} style={{ position: 'absolute', left: (size - sky) / 2, top: (size - sky) / 2 }}>
        <Sky size={sky} />
      </Arrive>

      {STARS.map(([x, y, r, kind, tone, twinkle], i) => (
        <StarMark key={i} size={size} x={x} y={y} r={r} kind={kind} tone={tone} twinkle={twinkle} />
      ))}

      {companions
        ? COMPANIONS.map((planet, i) => {
            const w = size * planet.w;
            return (
              <Arrive key={i} index={2 + i} style={{ position: 'absolute', left: size * planet.x - w / 2, top: size * planet.y }}>
                <Bob periodMs={planet.bobMs} swayDeg={planet.sway} bobPx={IDLE.bobPx - 1}>
                  <Image source={planet.src} style={{ width: w, height: w * planet.ratio }} contentFit="contain" />
                </Bob>
              </Arrive>
            );
          })
        : null}

      <Arrive index={1} style={{ position: 'absolute', left: 0, top: 0 }}>
        <Bob periodMs={IDLE.bobMs} swayDeg={IDLE.swayDeg} bobPx={IDLE.bobPx}>
          <Image source={ART[name]} style={{ width: size, height: size }} contentFit="contain" />
        </Bob>
      </Arrive>
    </View>
  );
}

/** The brand sky: warm core, lilac band, cream rim, fading out before its edge. */
function Sky({ size }: { readonly size: number }): ReactNode {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="worldSky" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={Colors.worldSkyCore} stopOpacity={0.95} />
          <Stop offset="0.36" stopColor={Colors.worldSkyMid} stopOpacity={0.62} />
          <Stop offset="0.66" stopColor={Colors.worldSkyRim} stopOpacity={0.32} />
          <Stop offset="1" stopColor={Colors.worldSkyRim} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#worldSky)" />
    </Svg>
  );
}

function starColor(tone: Tone): string {
  if (tone === 1) return Colors.worldStarPeriwinkle;
  if (tone === 2) return Colors.worldStarPink;
  if (tone === 3) return Colors.worldStarButter;
  return Colors.worldStarWhite;
}

/** The library's four-point sparkle, radius `r`, centred in a 2r box. */
function sparklePath(r: number): string {
  const k = r * 0.16;
  return `M${r} 0C${r + k} ${r - k} ${r + k} ${r - k} ${2 * r} ${r}C${r + k} ${r + k} ${r + k} ${r + k} ${r} ${2 * r}C${r - k} ${r + k} ${r - k} ${r + k} 0 ${r}C${r - k} ${r - k} ${r - k} ${r - k} ${r} 0Z`;
}

function StarMark({
  size,
  x,
  y,
  r,
  kind,
  tone,
  twinkle,
}: {
  readonly size: number;
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly kind: 's' | 'd';
  readonly tone: Tone;
  readonly twinkle?: number;
}): ReactNode {
  const reduceMotion = useReducedMotion();
  const breath = useSharedValue(1);
  const radius = Math.max(1.5, size * r);

  useEffect(() => {
    if (reduceMotion || twinkle === undefined) return;
    // Out of step, like the web's `animation-delay: calc(var(--tw) * -1.7s)`.
    breath.value = withDelay(
      (twinkle * 1700) % IDLE.twinkleMs,
      withRepeat(withTiming(0.3, { duration: IDLE.twinkleMs, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [breath, reduceMotion, twinkle]);

  const style = useAnimatedStyle(() => ({ opacity: breath.value }));
  const color = starColor(tone);

  return (
    <Arrive
      index={3}
      style={{ position: 'absolute', left: size * x - radius, top: size * y - radius }}
    >
      <Animated.View style={style}>
        <Svg width={radius * 2} height={radius * 2}>
          {kind === 's' ? (
            <Path d={sparklePath(radius)} fill={color} />
          ) : (
            <Circle cx={radius} cy={radius} r={radius} fill={color} />
          )}
        </Svg>
      </Animated.View>
    </Arrive>
  );
}

/** The web's `fadeUp`: rise a little and fade in, one layer after another. */
function Arrive({
  index,
  style,
  children,
}: {
  readonly index: number;
  readonly style: object;
  readonly children: ReactNode;
}): ReactNode {
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    shown.value = withDelay(
      index * IDLE.enterStaggerMs,
      withTiming(1, { duration: IDLE.enterMs, easing: EASE_OUT }),
    );
  }, [index, reduceMotion, shown]);

  const animated = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * 12 }],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** Float a few px and lean a degree or two, forever, on its own period. */
function Bob({
  periodMs,
  swayDeg,
  bobPx,
  children,
}: {
  readonly periodMs: number;
  readonly swayDeg: number;
  readonly bobPx: number;
  readonly children: ReactNode;
}): ReactNode {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    t.value = withDelay(
      IDLE.enterMs,
      withRepeat(withTiming(1, { duration: periodMs, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [periodMs, reduceMotion, t]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -t.value * bobPx }, { rotate: `${t.value * swayDeg}deg` }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
