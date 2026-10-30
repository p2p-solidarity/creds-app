/**
 * Light / Dark switch reaches every screen.
 *
 * Most components read `Colors.*` (a Proxy that resolves against the current
 * scheme on every read) instead of subscribing through `useThemeColors()`.
 * A Proxy read only lands when the component renders again, and React
 * Navigation wraps every screen in a memoized `StaticContainer` that skips
 * re-renders from above — so after a switch only hook-driven pieces flipped
 * and the rest kept the old palette (a white selected segment on a dark page).
 *
 * `themeRefreshLayout` is the navigators' `screenLayout`: a leaf screen is
 * keyed by the applied scheme, so a switch remounts it with the new palette.
 * Navigator routes (`(tabs)`) are not keyed — their own `screenLayout` keys
 * their screens — so navigation state and the selected tab survive; only a
 * screen's local UI state (scroll, an open fold) starts over.
 */
import { Fragment, type ReactElement } from 'react';
import { useColorScheme } from 'react-native';

function ThemeRemount({ children }: { readonly children: ReactElement }): ReactElement {
  const scheme = useColorScheme() ?? 'light';
  return <Fragment key={scheme}>{children}</Fragment>;
}

export function themeRefreshLayout({
  route,
  children,
}: {
  readonly route: { readonly name: string };
  readonly children: ReactElement;
}): ReactElement {
  // A `(group)` route is a nested navigator; remounting it would reset its state.
  if (route.name.startsWith('(')) return children;
  return <ThemeRemount>{children}</ThemeRemount>;
}
