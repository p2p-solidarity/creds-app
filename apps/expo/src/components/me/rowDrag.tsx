/**
 * Drag-to-reorder mechanics shared by the Page tab's row lists.
 *
 * One controller per contiguous section; every row in the section derives its
 * transform from the same three shared values, so the picked-up row carries
 * the WHOLE row under the finger (not just its grip), neighbours step aside
 * live as the drag crosses their slot, crossings tick, and release settles
 * the row into its destination slot before the reorder commits.
 *
 * Runtime contract: everything the pan worklets call synchronously runs on
 * the UI runtime and must be a worklet (`rubberClamp`, `settleBack`, and
 * `dragDestinationForSlots` / `rowSlot` / `slotOffset` from pageRowStyles). Dropping a `'worklet'`
 * directive here is the release-build crash "[Worklets] Tried to
 * synchronously call a non-worklet function on the UI thread" — guarded at
 * the artifact level by `__tests__/unit/pageRowStylesWorklet.test.ts`.
 *
 * Commit protocol: `onMove` runs on the JS thread and must end by calling
 * `resetRowDrag` in the same task as the state commit, so the reordered
 * layout and the identity transforms paint on the same frame (row keys
 * include the index, so a committed reorder remounts rows clean).
 */
import { useMemo, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, useExclusiveGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { Colors } from '@/constants/Colors';
import { haptic } from '@/feedback/haptics';
import { SCALE, SPRING } from '@/feedback/motion';

import { dragDestinationForSlots, rowSlot, slotOffset } from './pageRowStyles';

export interface RowDragController {
  /** Section index of the row being carried; -1 when idle. */
  readonly activeIndex: SharedValue<number>;
  /** The carried row's live vertical offset from its own slot. */
  readonly dragY: SharedValue<number>;
  /** Slot the drag currently resolves to; -1 when idle. */
  readonly destination: SharedValue<number>;
  /** Each row's measured height by section index (0 = not measured yet). */
  readonly heights: SharedValue<number[]>;
}

export function useRowDragController(): RowDragController {
  const activeIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const destination = useSharedValue(-1);
  const heights = useSharedValue<number[]>([]);
  return useMemo(
    () => ({ activeIndex, dragY, destination, heights }),
    [activeIndex, dragY, destination, heights],
  );
}

/** JS-thread reset — call in the same task as the reorder commit (or a
 * refused move) so the new layout never paints under stale transforms. */
export function resetRowDrag(controller: RowDragController): void {
  controller.activeIndex.value = -1;
  controller.destination.value = -1;
  controller.dragY.value = 0;
}

/** Resist travel past the list's ends instead of stopping dead — the drag
 * keeps answering the finger, just heavier, the way iOS lists overshoot. */
function rubberClamp(value: number, min: number, max: number): number {
  'worklet';
  if (value < min) return min + (value - min) * 0.2;
  if (value > max) return max + (value - max) * 0.2;
  return value;
}

/** Spring the carried row home after a no-move release or a cancelled
 * gesture, and only then drop the carry so the lift settles with it. */
function settleBack(controller: RowDragController): void {
  'worklet';
  controller.destination.value = -1;
  controller.dragY.value = withSpring(0, SPRING.press, () => {
    controller.activeIndex.value = -1;
  });
}

/** Animated wrapper for one reorderable row. `stride` is the row's travel
 * per slot (height + gap) until the row has measured itself — import it from
 * pageRowStyles, never re-derive. Rows must be spaced by exactly `ROW_GAP`. */
export function DraggableRow({
  controller,
  index,
  stride,
  style,
  children,
}: {
  readonly controller: RowDragController;
  readonly index: number;
  readonly stride: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}): ReactNode {
  const shift = useSharedValue(0);
  const lift = useSharedValue(1);

  // Neighbours re-target only when the resolved slot changes, so the step
  // aside is one clean spring instead of one restarted every drag frame.
  useAnimatedReaction(
    () => {
      const active = controller.activeIndex.value;
      if (active === -1 || active === index) return 0;
      const destination = controller.destination.value;
      const carried = rowSlot(controller.heights.value, active, stride);
      if (index > active && index <= destination) return -carried;
      if (index < active && index >= destination) return carried;
      return 0;
    },
    (target, previous) => {
      if (target !== previous) shift.value = withSpring(target, SPRING.gentle);
    },
  );

  useAnimatedReaction(
    () => controller.activeIndex.value === index,
    (carried, previous) => {
      if (carried === previous) return;
      lift.value = carried
        ? withSpring(SCALE.rowLift, SPRING.zoom)
        : withSpring(1, SPRING.press);
    },
  );

  const animatedStyle = useAnimatedStyle(() => {
    const carried = controller.activeIndex.value === index;
    return {
      zIndex: carried ? 2 : 0,
      transform: [
        { translateY: carried ? controller.dragY.value : shift.value },
        { scale: lift.value },
      ],
    };
  });

  return (
    <Animated.View
      style={[style, animatedStyle]}
      onLayout={(event) => {
        const height = event.nativeEvent.layout.height;
        const current = controller.heights.value;
        if (current[index] === height) return;
        const next = [...current];
        next[index] = height;
        controller.heights.value = next;
      }}>
      {children}
    </Animated.View>
  );
}

/** The section's drag pan: a long press picks the row up, neighbours step
 * aside as it crosses their slots, release lands it and commits `onMove`. */
function useRowDragPan({
  controller,
  index,
  itemCount,
  stride,
  disabled,
  longPressMs,
  onMove,
}: {
  readonly controller: RowDragController;
  readonly index: number;
  readonly itemCount: number;
  readonly stride: number;
  readonly disabled: boolean;
  readonly longPressMs: number;
  readonly onMove: (destination: number) => void;
}) {
  return usePanGesture({
    enabled: !disabled,
    activateAfterLongPress: longPressMs,
    onActivate: () => {
      controller.activeIndex.value = index;
      controller.destination.value = index;
      controller.dragY.value = 0;
      scheduleOnRN(haptic, 'soft');
    },
    onUpdate: (event) => {
      const heights = controller.heights.value;
      controller.dragY.value = rubberClamp(
        event.translationY,
        slotOffset(heights, index, 0, stride),
        slotOffset(heights, index, itemCount - 1, stride),
      );
      const destination = dragDestinationForSlots(index, event.translationY, itemCount, heights, stride);
      if (destination !== controller.destination.value) {
        controller.destination.value = destination;
        scheduleOnRN(haptic, 'selection');
      }
    },
    onDeactivate: (event) => {
      const heights = controller.heights.value;
      const destination = dragDestinationForSlots(index, event.translationY, itemCount, heights, stride);
      if (destination !== index) {
        // Land in the destination slot first; the JS commit then repaints
        // the same geometry with identity transforms (see module header).
        controller.dragY.value = withSpring(slotOffset(heights, index, destination, stride), SPRING.press);
        scheduleOnRN(onMove, destination);
        return;
      }
      settleBack(controller);
    },
    onFinalize: (event) => {
      if (event.canceled) settleBack(controller);
    },
  });
}

/**
 * A whole row as its own grip, for rows that are content rather than list
 * items (the Page preview's blocks): a tap opens it, a long press picks it up
 * and drags it. Exposed to assistive tech as a button plus increment /
 * decrement to move one slot.
 */
export function RowDragArea({
  controller,
  index,
  itemCount,
  stride,
  label,
  moveLabel,
  onPress,
  onMove,
  children,
}: {
  readonly controller: RowDragController;
  readonly index: number;
  readonly itemCount: number;
  readonly stride: number;
  readonly label: string;
  readonly moveLabel: string;
  readonly onPress: () => void;
  readonly onMove: (destination: number) => void;
  readonly children: ReactNode;
}): ReactNode {
  const pan = useRowDragPan({
    controller,
    index,
    itemCount,
    stride,
    disabled: itemCount < 2,
    longPressMs: 250,
    onMove,
  });
  const tap = useTapGesture({
    runOnJS: true,
    onActivate: () => {
      haptic('tap');
      onPress();
    },
  });
  const gesture = useExclusiveGestures(pan, tap);
  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={moveLabel}
        accessibilityActions={[
          { name: 'activate', label },
          { name: 'decrement', label: moveLabel },
          { name: 'increment', label: moveLabel },
        ]}
        onAccessibilityAction={(event) => {
          const action = event.nativeEvent.actionName;
          if (action === 'activate') onPress();
          if (action === 'decrement' && index > 0) onMove(index - 1);
          if (action === 'increment' && index < itemCount - 1) onMove(index + 1);
        }}>
        {children}
      </View>
    </GestureDetector>
  );
}

/** 44pt grip that drives the section's drag. Also exposes the reorder to
 * assistive tech as an adjustable (increment / decrement move one slot). */
export function RowDragHandle({
  controller,
  index,
  itemCount,
  stride,
  height,
  label,
  disabled = false,
  onMove,
  children,
  width = 44,
}: {
  readonly controller: RowDragController;
  readonly index: number;
  readonly itemCount: number;
  readonly stride: number;
  readonly height: number;
  readonly label: string;
  readonly disabled?: boolean;
  readonly onMove: (destination: number) => void;
  /** Grip face; defaults to the six-dot glyph. A link row uses its avatar. */
  readonly children?: ReactNode;
  /** Grip width; the default fits the six-dot glyph's 44pt target. */
  readonly width?: number;
}): ReactNode {
  const pan = useRowDragPan({ controller, index, itemCount, stride, disabled, longPressMs: 120, onMove });

  return (
    <GestureDetector gesture={pan}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityActions={[
          { name: 'decrement', label },
          { name: 'increment', label },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'decrement' && index > 0) onMove(index - 1);
          if (event.nativeEvent.actionName === 'increment' && index < itemCount - 1) onMove(index + 1);
        }}
        style={{
          width,
          height,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : 1,
        }}>
        {children ?? <Svg width={18} height={24} viewBox="0 0 18 24" fill="none">
          {[6, 12, 18].flatMap((cy) => [6, 12].map((cx) => (
            <Circle
              key={`${String(cx)}-${String(cy)}`}
              cx={cx}
              cy={cy}
              r={1.4}
              fill={Colors.text3}
            />
          )))}
        </Svg>}
      </View>
    </GestureDetector>
  );
}
