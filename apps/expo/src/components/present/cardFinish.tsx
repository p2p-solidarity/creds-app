/**
 * The card's finish — one choice shared by the Present card and the physical
 * card preview: three metals and the creds night sky (the creds.id landing's
 * blue-hour band: aurora fields, twinkling dots and four-point sparks).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';

import { CardFinishColors, CardMetalColors, Colors } from '@/constants/Colors';
import type { PhysicalCardMaterial } from '@/present/presentModel';
import { usePreferences } from '@/settings/preferences';

export type CardFinish = PhysicalCardMaterial;

export const CARD_FINISHES = ['steel', 'blackTitanium', 'brass', 'creds'] as const satisfies readonly CardFinish[];

export function useCardFinish(): CardFinish {
  return usePreferences((state) => state.presentPhysicalCardMaterial ?? 'steel');
}

export interface CardInk {
  readonly color: string;
  readonly textShadowColor: string;
  readonly textShadowOffset: { readonly width: number; readonly height: number };
  readonly textShadowRadius: number;
}

export interface FinishPalette {
  /** Lettering: engraved on metal, starlight on the creds sky. */
  readonly ink: CardInk;
  readonly faceBorder: string;
  /** A metal catches the one-off light sweep; the sky twinkles instead. */
  readonly metal: boolean;
  /** The creds mark's rings on this face (accent falls back to ink). */
  readonly markInk: string;
  readonly markAccent?: string;
}

function ink(color: string, shadow: string): CardInk {
  return { color, textShadowColor: shadow, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 };
}

export function finishPalette(finish: CardFinish): FinishPalette {
  switch (finish) {
    case 'steel':
      return { ink: ink(CardMetalColors.etch, CardMetalColors.etchShadow), faceBorder: CardMetalColors.faceBorder, metal: true, markInk: CardMetalColors.etch };
    case 'blackTitanium':
    case 'brass': {
      const c = CardFinishColors[finish];
      return { ink: ink(c.etch, c.etchShadow), faceBorder: c.faceBorder, metal: true, markInk: c.etch };
    }
    case 'creds': {
      const c = CardFinishColors.creds;
      return {
        ink: { color: c.ink, textShadowColor: c.inkShadow, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
        faceBorder: c.faceBorder,
        metal: false,
        markInk: Colors.logoInkDark,
        markAccent: Colors.logoAccentDark,
      };
    }
  }
}

/** Three stops for a small swatch of the finish. */
export function finishSwatch(finish: CardFinish): readonly [string, string, string] {
  switch (finish) {
    case 'steel':
      return [CardMetalColors.frontStops[0], CardMetalColors.frontStops[2], CardMetalColors.frontStops[7]];
    case 'blackTitanium':
    case 'brass': {
      const stops = CardFinishColors[finish].frontStops;
      return [stops[0], stops[2], stops[7]];
    }
    case 'creds':
      return [CardFinishColors.creds.auroraA, CardFinishColors.creds.sky[0], CardFinishColors.creds.sky[2]];
  }
}

function metalStops(finish: Exclude<CardFinish, 'creds'>, side: 'front' | 'back') {
  if (finish === 'steel') {
    return side === 'front'
      ? { colors: CardMetalColors.frontStops, locations: CardMetalColors.frontLocations }
      : { colors: CardMetalColors.backStops, locations: CardMetalColors.backLocations };
  }
  const c = CardFinishColors[finish];
  return side === 'front'
    ? { colors: c.frontStops, locations: CardMetalColors.frontLocations }
    : { colors: c.backStops, locations: CardMetalColors.backLocations };
}

/**
 * The face's paint, filling its parent. Children sit on top. `side` mirrors
 * the brushing direction on the back, as the steel mock does.
 */
export function CardFaceBackground({
  finish,
  side,
  style,
  children,
}: {
  readonly finish: CardFinish;
  readonly side: 'front' | 'back';
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
}): ReactNode {
  const front = side === 'front';
  if (finish === 'creds') {
    return (
      <LinearGradient
        colors={CardFinishColors.creds.sky}
        locations={CardFinishColors.creds.skyLocations}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[{ flex: 1 }, style]}>
        <CredsSky mirrored={!front} />
        {children}
      </LinearGradient>
    );
  }
  const stops = metalStops(finish, side);
  return (
    <LinearGradient
      colors={stops.colors}
      locations={stops.locations}
      start={front ? { x: 0, y: 0.39 } : { x: 1, y: 0.61 }}
      end={front ? { x: 1, y: 0.61 } : { x: 0, y: 0.39 }}
      style={[{ flex: 1 }, style]}>
      {children}
    </LinearGradient>
  );
}

/** Fixed sky — the same stars every time, so the card never reshuffles. */
const STARS: readonly { x: number; y: number; r: number; spark?: boolean; period: number; phase: number }[] = [
  { x: 0.08, y: 0.18, r: 1.2, period: 4200, phase: 0 },
  { x: 0.22, y: 0.62, r: 1, period: 5600, phase: 900 },
  { x: 0.31, y: 0.12, r: 4.5, spark: true, period: 6400, phase: 300 },
  { x: 0.44, y: 0.4, r: 0.9, period: 3800, phase: 1500 },
  { x: 0.56, y: 0.2, r: 1.3, period: 5000, phase: 600 },
  { x: 0.63, y: 0.74, r: 1, period: 4600, phase: 2100 },
  { x: 0.71, y: 0.34, r: 5.5, spark: true, period: 7200, phase: 1200 },
  { x: 0.82, y: 0.14, r: 1.1, period: 4400, phase: 400 },
  { x: 0.9, y: 0.52, r: 0.9, period: 5200, phase: 1800 },
  { x: 0.94, y: 0.86, r: 1.2, period: 3900, phase: 700 },
  { x: 0.13, y: 0.88, r: 3.5, spark: true, period: 6800, phase: 2400 },
  { x: 0.5, y: 0.9, r: 0.8, period: 4800, phase: 1000 },
];

const SPARK_PATH = 'M50 0 L59 41 L100 50 L59 59 L50 100 L41 59 L0 50 L41 41 Z';

function CredsSky({ mirrored }: { readonly mirrored: boolean }): ReactNode {
  const c = CardFinishColors.creds;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, mirrored ? { transform: [{ scaleX: -1 }] } : null]}>
      <Svg width="100%" height="100%" viewBox="0 0 160 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="auroraA" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={c.auroraA} />
            <Stop offset="1" stopColor={c.auroraA} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="auroraB" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={c.auroraB} />
            <Stop offset="1" stopColor={c.auroraB} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="auroraC" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={c.auroraC} />
            <Stop offset="1" stopColor={c.auroraC} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={18} cy={-6} rx={78} ry={58} fill="url(#auroraA)" />
        <Ellipse cx={150} cy={22} rx={70} ry={56} fill="url(#auroraB)" />
        <Ellipse cx={92} cy={88} rx={52} ry={34} fill="url(#auroraC)" />
      </Svg>
      {STARS.map((star) => (
        <Star key={`${String(star.x)}-${String(star.y)}`} {...star} />
      ))}
    </View>
  );
}

function Star({
  x,
  y,
  r,
  spark = false,
  period,
  phase,
}: {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly spark?: boolean;
  readonly period: number;
  readonly phase: number;
}): ReactNode {
  const reduceMotion = useReducedMotion();
  const glow = useSharedValue(0.75);

  useEffect(() => {
    if (reduceMotion) {
      glow.value = 0.75;
      return;
    }
    // `.door-star` twinkle: 0.3 ↔ 1, each on its own period and phase.
    glow.value = 0.3;
    glow.value = withDelay(
      phase,
      withRepeat(withTiming(1, { duration: period / 2, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [glow, period, phase, reduceMotion]);

  const style = useAnimatedStyle(() => ({ opacity: glow.value }));
  const size = r * 2;
  const c = CardFinishColors.creds;
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: `${String(x * 100)}%`,
          top: `${String(y * 100)}%`,
          width: size,
          height: size,
          marginLeft: -r,
          marginTop: -r,
        },
        style,
      ]}>
      {spark ? (
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Path d={SPARK_PATH} fill={c.spark} />
        </Svg>
      ) : (
        <View style={{ flex: 1, borderRadius: r, backgroundColor: c.star }} />
      )}
    </Animated.View>
  );
}
