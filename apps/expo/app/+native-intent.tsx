/**
 * Expo Router's hook for incoming system URLs. A shared Page link
 * (`creds.id/@name`, `creds.id/#nostr:<npub>`, `creds.id/#<fragment>`) is not a
 * screen: `handleDeepLink` (`app/_layout.tsx`) opens it in the global
 * `VerifiedPageResultSheet`. Left to the router, `/@name` landed on
 * "Unmatched Route" over the sheet and a `#…` link reset the stack to `/`.
 * So those links stay where the user is (or start at `/` on a cold launch);
 * every other URL routes as before.
 */
import { parseDeepLink } from '@/deeplink/parser';

const SHEET_ROUTES: ReadonlySet<string> = new Set(['verifiedHandle', 'verifiedPointer', 'verifiedProfile']);

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  if (!SHEET_ROUTES.has(parseDeepLink(path).kind)) return path;
  return initial ? '/' : null;
}
