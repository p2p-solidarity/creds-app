/**
 * WorldArt — the creds.id world illustrations (onboarding and empty states):
 * the page lighthouse on its floating island, drawn with gpt-image-2.5 from the
 * web hero as the style reference, on a transparent ground so they sit on any
 * surface in light or dark. Each one fades in, then floats idly like the web's
 * drawn worlds; under Reduce Motion it simply appears and stays still.
 */
import { Image } from 'expo-image';
import { useEffect, type ReactNode } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { IDLE_FLOAT, TIMING } from '@/feedback/motion';

const ART = {
  welcome: require('../../../assets/art/welcome.webp') as number,
  ready: require('../../../assets/art/ready.webp') as number,
  people: require('../../../assets/art/people.webp') as number,
  page: require('../../../assets/art/page.webp') as number,
  verify: require('../../../assets/art/verify.webp') as number,
} as const;

export type WorldArtName = keyof typeof ART;

export function WorldArt({
  name,
  size,
}: {
  readonly name: WorldArtName;
  readonly size: number;
}): ReactNode {
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(reduceMotion ? 1 : 0);
  const float = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    shown.value = withTiming(1, TIMING.enter);
    float.value = withRepeat(
      withTiming(1, { duration: IDLE_FLOAT.durationMs, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [float, reduceMotion, shown]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [
      { translateY: -float.value * IDLE_FLOAT.risePx },
      { scale: 0.96 + shown.value * 0.04 },
    ],
  }));

  return (
    <Animated.View style={[{ width: size, height: size }, style]}>
      <Image
        source={ART[name]}
        style={{ width: size, height: size }}
        contentFit="contain"
        accessible={false}
      />
    </Animated.View>
  );
}
