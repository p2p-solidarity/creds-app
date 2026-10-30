# Witness tier-4 page fetch: SSRF guard (2026-10-30)

`fetchPublicPage` (`apps/expo/src/witness/witness.ts`) now goes through
`createPublicPageFetch` in `apps/expo/src/profile/httpsOwnership.ts`: every hop
must pass `publicHttpsUrl` (https, no credentials, not localhost / `localhost.`,
no IPv6 literal, no private / CGNAT / link-local IPv4 incl. `2130706433`-style
forms) before the phone connects; at most 5 redirects; body capped at 4 MiB.
The transport is `expo/fetch` imported by name with `redirect: 'manual'`
(SDK 57 already makes it the global fetch, but `EXPO_PUBLIC_USE_RN_FETCH`
would switch back to RN's whatwg-fetch over XHR, which ignores `redirect`).
`expo/fetch` honors it natively: iOS `NativeResponse.swift` calls
`completionHandler(nil)`, Android `NativeRequest.kt` sets `followRedirects(false)`.

## Real-network run (bun `fetch`, which honors `redirect: 'manual'`)

| Request | Result | Hosts connected |
|---|---|---|
| `https://github.com/kidneyweakx` | 200, 199 831 bytes | that page only |
| httpbin 302 → `http://example.com/` | stops at 302 (→ `blocked`) | httpbin only |
| httpbin 302 → `https://example.com/` | 200 | httpbin, example.com |
| `httpbin.org/redirect/8` | stops at 302 after 5 hops | 6 httpbin URLs |
| jsDelivr `typescript.js` (~9 MB) | `network` (over cap) | jsDelivr |
| `https://127.0.0.1/`, `http://example.com/` | `network` | none |

httpbin / httpbingo refuse to redirect to private IPs themselves (403), so a
real redirect to a private IP was only exercised by the unit tests
(`apps/expo/__tests__/unit/publicPageFetch.test.ts`).

## Not run

- On device / simulator: `expo/fetch` manual-redirect behavior was checked by
  reading its native source, not by a dev-client run.
- DNS: a public hostname that resolves to a private address is not caught
  (the guard checks what the URL names, like the existing ownership check).
