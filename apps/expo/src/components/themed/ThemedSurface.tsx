/**
 * ThemedSurface — card / sheet / outlined container.
 *
 * Use this instead of inlining
 *   { backgroundColor: theme.cardBg, borderColor: theme.divider, borderWidth: 1 }
 * — keeps surface treatment consistent across the app and lets us tweak
 * radii / shadows in one place when iOS 26 Liquid Glass lands.
 */
import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

import { shadow } from '@/constants/radius';

export type SurfaceVariant = 'card' | 'elevated' | 'outlined' | 'inset';

// Radii by role (src/constants/radius.ts, = creds.id `--radius-*`).
const VARIANT_CLASS: Readonly<Record<SurfaceVariant, string>> = {
  // Solid card on pageBg
  card: 'bg-cardBg rounded-card border border-divider',
  // Lifted card — creds.id `--shadow-lift` (style below)
  elevated: 'bg-cardBg rounded-card',
  // Bordered group on pageBg
  outlined: 'bg-transparent rounded-card border border-divider',
  // Subtle inset like search backgrounds
  inset: 'bg-searchBg rounded-group',
};

export interface ThemedSurfaceProps extends ViewProps {
  readonly variant?: SurfaceVariant;
  /** Apply the standard 16-pt padding. */
  readonly padded?: boolean;
  readonly children?: ReactNode;
}

export function ThemedSurface({
  variant = 'card',
  padded = false,
  className,
  style,
  children,
  ...rest
}: ThemedSurfaceProps): ReactNode {
  const tw = [VARIANT_CLASS[variant], padded ? 'p-4' : '', className ?? '']
    .filter(Boolean)
    .join(' ')
    .trim();
  return (
    <View className={tw} style={variant === 'elevated' ? [shadow('lift'), style] : style} {...rest}>
      {children}
    </View>
  );
}
