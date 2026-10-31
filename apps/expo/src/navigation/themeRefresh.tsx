/**
 * The navigators' `screenLayout`: every leaf screen goes through here.
 *
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
 *
 * Content column (iPad): each leaf screen is centred in a column capped at
 * `ContentWidth.page` (forms at `ContentWidth.form`) on the page background,
 * so a 1032pt window doesn't stretch inputs and rows edge to edge. On a phone
 * the window is narrower than the cap and the column is the whole window.
 * Camera screens stay full-bleed.
 */
import { Fragment, type ReactElement } from 'react';
import { useColorScheme, View } from 'react-native';

import { ContentWidth } from '@/constants/layout';

/** Camera viewfinders fill the window. */
const FULL_BLEED_ROUTES: ReadonlySet<string> = new Set(['scan/index', 'passport/index']);

/** One-field flows read better narrower than the page column. */
const FORM_ROUTES: ReadonlySet<string> = new Set([
  'onboarding/index',
  'settings/username',
  'verify/bluesky',
  'verify/nostr',
]);

function ThemeRemount({ children }: { readonly children: ReactElement }): ReactElement {
  const scheme = useColorScheme() ?? 'light';
  return <Fragment key={scheme}>{children}</Fragment>;
}

function ContentColumn({
  maxWidth,
  children,
}: {
  readonly maxWidth: number;
  readonly children: ReactElement;
}): ReactElement {
  return (
    <View className="flex-1 bg-pageBg">
      <View style={{ flex: 1, width: '100%', maxWidth, alignSelf: 'center' }}>{children}</View>
    </View>
  );
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
  if (FULL_BLEED_ROUTES.has(route.name)) return <ThemeRemount>{children}</ThemeRemount>;
  const maxWidth = FORM_ROUTES.has(route.name) ? ContentWidth.form : ContentWidth.page;
  return (
    <ThemeRemount>
      <ContentColumn maxWidth={maxWidth}>{children}</ContentColumn>
    </ThemeRemount>
  );
}
