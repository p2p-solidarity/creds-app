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

export type SurfaceVariant = 'card' | 'elevated' | 'outlined' | 'inset';

// Radii by role, the same table as creds.id (`--radius-*`): a bordered
// content card is square, a sheet is 16, a muted group is 12.
const VARIANT_CLASS: Readonly<Record<SurfaceVariant, string>> = {
  // Solid card on pageBg
  card: 'bg-cardBg rounded-none border border-divider',
  // Sheet / modal — slightly raised
  elevated: 'bg-cardBg rounded-2xl shadow-lg shadow-black/10',
  // Bordered group on pageBg
  outlined: 'bg-transparent rounded-none border border-divider',
  // Subtle inset like search backgrounds
  inset: 'bg-searchBg rounded-xl',
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
  children,
  ...rest
}: ThemedSurfaceProps): ReactNode {
  const tw = [VARIANT_CLASS[variant], padded ? 'p-4' : '', className ?? '']
    .filter(Boolean)
    .join(' ')
    .trim();
  return (
    <View className={tw} {...rest}>
      {children}
    </View>
  );
}
