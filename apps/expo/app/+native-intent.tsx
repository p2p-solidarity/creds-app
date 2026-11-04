/**
 * Expo Router's hook for incoming system URLs. Every link `parseDeepLink`
 * recognises — a shared Page link (`creds.id/@name`, `#nostr:<npub>`,
 * `#<fragment>`) or an app-scheme route (`credsid://websign`, `card`, …) — is not a screen path: `handleDeepLink` (`app/_layout.tsx`) opens the
 * right sheet or screen itself. Left to the router, those paths landed on
 * "Unmatched Route" over the real destination and a `#…` link reset the stack
 * to `/`. So recognised links stay where the user is (or start at `/` on a
 * cold launch); only unrecognised URLs (dev-client links, plain screen paths
 * like `credsid://settings/backup`) route as before.
 *
 * A web-only page on our own host (`creds.id/edit`, `/privacy`, …) can still
 * arrive here while a device holds an older, catch-all apple-app-site-
 * association. It is a web page, not an app screen, so it opens in the
 * in-app browser (which never hands a universal link back to the app).
 */
import * as WebBrowser from 'expo-web-browser';
import { isProductHost } from '@/deeplink/domainVerification';
import { parseDeepLink } from '@/deeplink/parser';

function webOnlyProductUrl(path: string): string | null {
  try {
    const url = new URL(path);
    return url.protocol === 'https:' && isProductHost(url.host) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  if (parseDeepLink(path).kind !== 'unknown') return initial ? '/' : null;
  const webUrl = webOnlyProductUrl(path);
  if (webUrl === null) return path;
  void WebBrowser.openBrowserAsync(webUrl).catch(() => undefined);
  return initial ? '/' : null;
}
