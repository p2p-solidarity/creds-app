/**
 * The Solid(ar)ity / creds.id type (Figma): DM Sans for headings, Inter for
 * everything else — the same pair the web uses (airmeishi-web theme.css
 * `--font-display` / `--font-sans`). The files are embedded by `expo-font`
 * (app.json) under their PostScript names, which iOS and Android both resolve,
 * so a weight is a family here, never a `fontWeight` (Android would fake-bold a
 * single-weight family).
 *
 * `MONO` stays for what really is machine text — keys, hashes, DIDs, proofs.
 * Handles, URLs and names are words; they take Inter.
 */
import { Platform, type TextStyle } from 'react-native';

type Weight = NonNullable<TextStyle['fontWeight']>;

const INTER = {
  400: 'Inter-Regular',
  500: 'Inter-Medium',
  600: 'Inter-SemiBold',
  700: 'Inter-Bold',
} as const;

const DM_SANS = {
  600: 'DMSans-SemiBold',
  700: 'DMSans-Bold',
} as const;

export const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

function numeric(weight: Weight | undefined): number {
  if (weight === undefined || weight === 'normal' || weight === 'regular') return 400;
  if (weight === 'bold') return 700;
  if (typeof weight === 'number') return weight;
  const n = Number.parseInt(weight, 10);
  return Number.isNaN(n) ? 400 : n;
}

/** Inter at the nearest weight we ship (≤400 → Regular, ≥700 → Bold). */
export function textFont(weight?: Weight): string {
  const n = numeric(weight);
  if (n >= 700) return INTER[700];
  if (n >= 600) return INTER[600];
  if (n >= 500) return INTER[500];
  return INTER[400];
}

/** DM Sans for headings: SemiBold, or Bold from 700 up. */
export function displayFont(weight?: Weight): string {
  return numeric(weight) >= 700 ? DM_SANS[700] : DM_SANS[600];
}
