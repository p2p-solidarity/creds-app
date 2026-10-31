/**
 * Corner radii and shadows by role — the creds.id web tokens 1:1
 * (airmeishi-web `theme.css` `--radius-*` / `--shadow-*`). When the app and
 * the web disagree, the web wins; change both together.
 *
 *   button  every CTA, segmented control and icon button          6
 *   card    a bordered content card, link row, QR plate          12
 *   group   a muted settings group / grouped list                12
 *   field   text inputs, inline code / marker chips               2
 *   xs      small inner pieces (segment thumb, tag)               2
 *   sheet   bottom sheets and modal panels                       16
 *   pill    chips, badges, avatars, dots — anything round       999
 *
 * NativeWind mirrors these as `rounded-button`, `rounded-card`, … (tailwind
 * config). A component never writes a bare number: a circle of a computed
 * size uses `pill`.
 */
import type { ViewStyle } from 'react-native';

import { Colors } from './Colors';

export const Radius = {
  button: 6,
  card: 12,
  group: 12,
  field: 2,
  xs: 2,
  sheet: 16,
  pill: 999,
} as const;

export type RadiusRole = keyof typeof Radius;

export type ShadowRole = 'avatar' | 'lift' | 'sheet';

const SHADOW_KEY = {
  avatar: 'shadowAvatar',
  lift: 'shadowLift',
  sheet: 'shadowSheet',
} as const satisfies Record<ShadowRole, string>;

/** `boxShadow` for a role; reads through the Colors proxy so it follows light/dark. */
export function shadow(role: ShadowRole): Pick<ViewStyle, 'boxShadow'> {
  return { boxShadow: Colors[SHADOW_KEY[role]] };
}
