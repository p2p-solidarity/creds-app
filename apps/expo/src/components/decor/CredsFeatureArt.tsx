/**
 * creds-design feature illustrations — ports of the mock v3 `#w-feature-*`
 * sprite (viewBox 0 0 237 237):
 *   `#w-feature-3` → empty list: blocks resting on two rules
 *   empty People → a field of creds.id ring marks
 *
 * Faithful-with-two-deviations port:
 *   - The mock renders strokes INSIDE each shape via per-path masks; masks
 *     are dropped here and the 2px stroke is centred instead — at the 140 to
 *     200pt display sizes the half-pixel silhouette difference is invisible
 *     and it saves 15 mask defs per art.
 *   - Colours come from theme tokens instead of the mock's literals
 *     (white → cardBg, #2F2F30 ink/stroke → text1, dark-mode stroke #BEBCB6 →
 *     text2Dark, #959390 → text3), so the art follows light/dark for free.
 */
import { useEffect, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { G, Path } from 'react-native-svg';

import { CREDS_MARK } from '@/components/brand/credsLogo';

import { Colors } from '@/constants/Colors';
import { EASE_OUT, IDLE } from '@/feedback/motion';

type ArtRole = 'paper' | 'ink' | 'muted' | 'accent' | 'none';

interface ArtPath {
  readonly d: string;
  readonly fill: ArtRole;
  readonly fillOpacity?: number;
  readonly strokeWidth: number;
}

const VIEW_BOX = '0 0 237 237';

function ArtSvg({ size, paths }: { readonly size: number; readonly paths: readonly ArtPath[] }): ReactNode {
  const scheme = useColorScheme();
  // Mock dark variants keep muted warm-grey outlines (#BEBCB6) — text2 is the
  // closest token; light mode outlines are ink (text1). The Colors proxy
  // resolves each token for the active scheme at render time.
  const line = scheme === 'dark' ? Colors.text2 : Colors.text1;
  const fillFor: Record<ArtRole, string> = {
    paper: Colors.cardBg,
    ink: line,
    muted: Colors.text3,
    // The mock keeps #E4DED8 IDENTICAL in its dark variants — it is a warm
    // paper accent, not a themed surface — so this one maps to the
    // non-adaptive `warmCream` token instead of switching with the scheme.
    accent: Colors.warmCream,
    none: 'none',
  };
  return (
    <Idle>
      <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
      {paths.map((path, index) => (
        <Path
          key={index}
          d={path.d}
          fill={fillFor[path.fill]}
          fillOpacity={path.fillOpacity}
          stroke={line}
          strokeWidth={path.strokeWidth}
        />
      ))}
      </Svg>
    </Idle>
  );
}

/**
 * The art arrives (fade up, the web's `fadeUp`) and then floats a few px on a
 * slow period — the creds.id idle rhythm (motion.ts `IDLE`). Still under
 * Reduce Motion.
 */
function Idle({ children }: { readonly children: ReactNode }): ReactNode {
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(reduceMotion ? 1 : 0);
  const bob = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    shown.value = withTiming(1, { duration: IDLE.enterMs, easing: EASE_OUT });
    bob.value = withDelay(
      IDLE.enterMs,
      withRepeat(withTiming(1, { duration: IDLE.bobMs, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [bob, reduceMotion, shown]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * 12 - bob.value * IDLE.bobPx }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * Empty-People art — a 4×3 field of creds.id marks (two rings each), drawn in
 * the same outline style as the other feature art: most rings paper, a few
 * inked or accented, as if some people here are already linked. Replaces the
 * mock's arc stacks, which read as the old Solid(ar)ity S.
 */
export function PeopleFeatureArt({ size = 96 }: { readonly size?: number }): ReactNode {
  const scheme = useColorScheme();
  const line = scheme === 'dark' ? Colors.text2 : Colors.text1;
  const fill: Record<MarkFill, string> = {
    paper: Colors.cardBg,
    ink: line,
    muted: Colors.text3,
    accent: scheme === 'dark' ? Colors.logoAccentDark : Colors.logoAccent,
  };
  return (
    <Idle>
      <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
        {PEOPLE_GRID.map((cell, index) => (
          <G
            key={index}
            transform={`translate(${String(cell.x)} ${String(cell.y)}) scale(${String(MARK_SCALE)})`}>
            <Path d={CREDS_MARK.ink} fill={fill[cell.ink]} stroke={line} strokeWidth={MARK_STROKE} />
            <Path d={CREDS_MARK.accent} fill={fill[cell.accent]} stroke={line} strokeWidth={MARK_STROKE} />
          </G>
        ))}
      </Svg>
    </Idle>
  );
}

type MarkFill = 'paper' | 'ink' | 'muted' | 'accent';

/** Each mark is ~38 units wide inside the 237 box; strokes stay ~1.5 units after scaling. */
const MARK_SCALE = 0.23;
const MARK_STROKE = 1.5 / MARK_SCALE;
const MARK_PITCH = 50;
const GRID_ORIGIN = { x: 20, y: 44 };
const PEOPLE_FILLS: readonly (readonly [MarkFill, MarkFill])[] = [
  ['muted', 'paper'], ['paper', 'paper'], ['paper', 'paper'], ['paper', 'paper'],
  ['paper', 'paper'], ['ink', 'accent'], ['paper', 'paper'], ['paper', 'muted'],
  ['paper', 'muted'], ['paper', 'paper'], ['paper', 'paper'], ['paper', 'paper'],
];
const PEOPLE_GRID = PEOPLE_FILLS.map(([ink, accent], index) => ({
  x: GRID_ORIGIN.x + (index % 4) * MARK_PITCH,
  y: GRID_ORIGIN.y + Math.floor(index / 4) * MARK_PITCH,
  ink,
  accent,
}));

/** Empty-list art — mock `.es-art` renders it at 96px. */
export function EmptyListFeatureArt({ size = 96 }: { readonly size?: number }): ReactNode {
  return <ArtSvg size={size} paths={EMPTY_LIST_PATHS} />;
}

/**
 * `#w-feature-3` — three blocks on an upper rule, six on a lower one. The
 * mock draws these as `<rect>`/`<line>`; they are expressed as path data here
 * so the whole sprite goes through one renderer. Painting order is the mock's:
 * each rule crosses the blocks drawn before it.
 */
const EMPTY_LIST_PATHS: readonly ArtPath[] = [
  { d: 'M94.5 75.5H142.5V96.5H94.5Z', fill: 'ink', strokeWidth: 1 },
  { d: 'M237 88.5H0', fill: 'none', strokeWidth: 1 },
  { d: 'M27.5 75.5H75.5V96.5H27.5Z', fill: 'paper', strokeWidth: 1 },
  { d: 'M161.5 75.5H207.5V96.5H161.5Z', fill: 'accent', strokeWidth: 1 },
  { d: 'M59.5 124.5H80.5V145.5H59.5Z', fill: 'ink', strokeWidth: 1 },
  { d: 'M155.5 124.5H176.5V145.5H155.5Z', fill: 'ink', strokeWidth: 1 },
  { d: 'M237 135.5H0', fill: 'none', strokeWidth: 1 },
  { d: 'M27.5 124.5H48.5V145.5H27.5Z', fill: 'paper', strokeWidth: 1 },
  { d: 'M123.5 124.5H144.5V145.5H123.5Z', fill: 'paper', strokeWidth: 1 },
  { d: 'M91.5 124.5H112.5V145.5H91.5Z', fill: 'accent', strokeWidth: 1 },
  { d: 'M187.5 124.5H208.5V145.5H187.5Z', fill: 'accent', strokeWidth: 1 },
];

