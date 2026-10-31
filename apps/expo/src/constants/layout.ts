/**
 * Content widths — the readable column every screen sits in.
 *
 * On a phone the window is narrower than both caps, so nothing changes. On an
 * iPad (the app ships `supportsTablet`) a 1032pt window would otherwise stretch
 * every input, button and list row edge to edge, so the screen layout centres
 * the screen in a column of at most `page` (≈ UIKit's readable content width);
 * single-field forms use the narrower `form`.
 *
 *   page     tab screens, settings, the Page editor, detail pages      680
 *   form     onboarding and one-field forms (name, handle entry)       560
 *   card     the Present tab's metal card — business-card size         420
 */
import { useWindowDimensions } from 'react-native';

export const ContentWidth = {
  page: 680,
  form: 560,
  card: 420,
} as const;

/** The width a screen's content actually gets: the window, capped at `page`. */
export function useContentWidth(): number {
  const { width } = useWindowDimensions();
  return Math.min(width, ContentWidth.page);
}
