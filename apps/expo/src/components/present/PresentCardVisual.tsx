import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  SensorType,
  clamp,
  useAnimatedSensor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { CredsMark } from '@/components/brand/CredsMark';
import { PressableScale } from '@/components/common/PressableScale';
import { CardFaceBackground, finishPalette, type CardFinish } from '@/components/present/cardFinish';
import { ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { ContentWidth } from '@/constants/layout';
import { Radius } from '@/constants/radius';
import { DURATION, EASE_OUT, IDLE, SPRING } from '@/feedback/motion';

/** `.metal` — credit-card proportions; corners follow the card role. */
const CARD_ASPECT_RATIO = 1.586;
const CARD_RADIUS = Radius.card;

function CardSheen(): ReactNode {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(-1);

  useEffect(() => {
    progress.value = -1;
    if (reduceMotion) return;
    progress.value = withDelay(DURATION.enter, withTiming(1, { duration: IDLE.enterMs, easing: EASE_OUT }));
  }, [progress, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * 330 }, { rotate: '18deg' }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: -90,
          left: 0,
          width: 92,
          height: 410,
          opacity: 0.48,
        },
        style,
      ]}>
      <LinearGradient
        colors={['transparent', 'rgba(255,255,255,0.72)', 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

function useCardMotion(isFlipped: boolean) {
  const reduceMotion = useReducedMotion();
  const rotation = useAnimatedSensor(SensorType.ROTATION, {
    interval: 80,
    adjustToInterfaceOrientation: true,
  });
  const flip = useSharedValue(0);

  useEffect(() => {
    flip.value = reduceMotion
      ? isFlipped ? 180 : 0
      : withSpring(isFlipped ? 180 : 0, SPRING.gentle);
  }, [flip, isFlipped, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) rotation.unregister();
  }, [reduceMotion, rotation]);

  const tiltStyle = useAnimatedStyle(() => {
    const pitch = reduceMotion || !rotation.isAvailable
      ? 0
      : clamp(rotation.sensor.value.pitch * 8, -6, 6);
    const roll = reduceMotion || !rotation.isAvailable
      ? 0
      : clamp(rotation.sensor.value.roll * 8, -7, 7);
    return {
      transform: [
        { perspective: 900 },
        { rotateX: `${String(-pitch)}deg` },
        { rotateY: `${String(roll)}deg` },
      ],
    };
  });
  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 900 }, { rotateY: `${String(flip.value)}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 900 }, { rotateY: `${String(flip.value + 180)}deg` }],
  }));

  return { tiltStyle, frontStyle, backStyle };
}

interface PresentCardVisualProps {
  readonly finish: CardFinish;
  readonly name: string | null;
  /** Printed under the name in mono — the page address this card hands over. */
  readonly displayUrl: string;
  /** Which QR the plate below shows, e.g. "Online page". */
  readonly summary: string;
  readonly scanHint: string;
  /** The card flips on tap; this names that for assistive tech. */
  readonly flipLabel: string;
}

export function PresentCardVisual(props: PresentCardVisualProps): ReactNode {
  const [isFlipped, setIsFlipped] = useState(false);
  const { tiltStyle, frontStyle, backStyle } = useCardMotion(isFlipped);
  const palette = finishPalette(props.finish);
  const ETCH_TEXT = palette.ink;
  const faceStyle = {
    position: 'absolute' as const,
    inset: 0,
    overflow: 'hidden' as const,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: palette.faceBorder,
    backfaceVisibility: 'hidden' as const,
  };
  const toggleFlip = () => {
    setIsFlipped((value) => !value);
  };

  return (
    // Business-card size at most: on an iPad the column would otherwise blow
    // the card up to ~650pt next to a phone-sized QR.
    <View style={{ gap: 12, width: '100%', maxWidth: ContentWidth.card, alignSelf: 'center' }}>
      <Animated.View style={tiltStyle}>
        <PressableScale
          haptic="tap"
          accessibilityRole="button"
          accessibilityLabel={props.flipLabel}
          accessibilityState={{ expanded: isFlipped }}
          onPress={toggleFlip}
          style={{
            aspectRatio: CARD_ASPECT_RATIO,
            borderRadius: CARD_RADIUS,
            shadowColor: Colors.text1,
            shadowOpacity: 0.22,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 12 },
            elevation: 8,
          }}>
          <Animated.View style={[faceStyle, frontStyle]}>
            <CardFaceBackground
              finish={props.finish}
              side="front"
              style={{ paddingVertical: 15, paddingHorizontal: 16 }}>
              {palette.metal ? <CardSheen /> : null}
              {/* The creds mark, quiet in the corner: the same drawing on every
                  platform, never a status glyph. */}
              <View style={{ position: 'absolute', top: 14, right: 15, opacity: 0.7 }}>
                <CredsMark size={22} ink={palette.markInk} accent={palette.markAccent} />
              </View>
              {props.name !== null ? (
                <ThemedText variant="titleLarge" numberOfLines={1} style={ETCH_TEXT}>
                  {props.name}
                </ThemedText>
              ) : null}
              <ThemedText
                variant="caption"
                numberOfLines={1}
                ellipsizeMode="middle"
                style={{ ...ETCH_TEXT, opacity: 0.82, marginTop: 1 }}>
                {props.displayUrl}
              </ThemedText>
              {/* `.m-row` — pinned to the bottom edge of the card. */}
              <View
                className="flex-row items-end"
                style={{ gap: 12, marginTop: 'auto' }}>
                <View className="min-w-0 flex-1">
                  <ThemedText variant="bodySmall" numberOfLines={1} style={ETCH_TEXT}>
                    {props.summary}
                  </ThemedText>
                  <ThemedText
                    variant="caption"
                    numberOfLines={1}
                    style={{ ...ETCH_TEXT, opacity: 0.72, marginTop: 2 }}>
                    {props.scanHint}
                  </ThemedText>
                </View>
              </View>
            </CardFaceBackground>
          </Animated.View>
          <Animated.View style={[faceStyle, backStyle]}>
            <CardFaceBackground
              finish={props.finish}
              side="back"
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: 18,
              }}>
              {palette.metal ? <CardSheen /> : null}
              {/* A fixed brand mark, not a glyph that could read as network state. */}
              <CredsMark size={44} ink={palette.markInk} accent={palette.markAccent} />
              <ThemedText variant="caption" style={{ ...ETCH_TEXT, letterSpacing: 2.2 }}>
                CREDS.ID
              </ThemedText>
              <ThemedText
                variant="caption"
                numberOfLines={1}
                ellipsizeMode="middle"
                style={{ ...ETCH_TEXT, opacity: 0.6 }}>
                {props.displayUrl}
              </ThemedText>
            </CardFaceBackground>
          </Animated.View>
        </PressableScale>
      </Animated.View>

    </View>
  );
}
