/**
 * Expo Router's hook for incoming system URLs. Every link `parseDeepLink`
 * recognises — a shared Page link (`creds.id/@name`, `#nostr:<npub>`,
 * `#<fragment>`) or an app-scheme route (`credsid://websign`, `card`, `pear`,
 * …) — is not a screen path: `handleDeepLink` (`app/_layout.tsx`) opens the
 * right sheet or screen itself. Left to the router, those paths landed on
 * "Unmatched Route" over the real destination and a `#…` link reset the stack
 * to `/`. So recognised links stay where the user is (or start at `/` on a
 * cold launch); only unrecognised URLs (dev-client links, plain screen paths
 * like `credsid://settings/backup`) route as before.
 */
import { parseDeepLink } from '@/deeplink/parser';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  if (parseDeepLink(path).kind === 'unknown') return path;
  return initial ? '/' : null;
}
