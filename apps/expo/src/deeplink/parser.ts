/**
 * Deep-link parser — pure URL → route table, no React Native imports so
 * it tests cleanly under Bun without dragging the Flow-typed RN runtime.
 * The handler (with `router.push` side effects) lives in ./handler.
 */
import { DEFAULT_HANDLE_RESOLVERS, matchHandleResolver } from '@solidarity/shared';

import { WEBSIGN_DEEPLINK_HOST, WEBSIGN_REQUEST_PARAM } from '../websign/transport';
import { isAppSchemeProtocol } from './appScheme';
import { isProductHost, isVerifiedDomain } from './domainVerification';

export type DeepLinkRoute =
  | { readonly kind: 'card'; readonly cardId: string }
  | { readonly kind: 'groupInvite'; readonly token: string }
  | { readonly kind: 'oidc'; readonly query: string }
  | { readonly kind: 'credentialOffer'; readonly query: string }
  | { readonly kind: 'verifiedProfile'; readonly fragment: string }
  | { readonly kind: 'verifiedPointer'; readonly npub: string }
  | { readonly kind: 'verifiedHandle'; readonly handle: string }
  | { readonly kind: 'webSign'; readonly request: string }
  | { readonly kind: 'unknown'; readonly raw: string };

/** Cheap structural gate for the `#nostr:<npub>` short-pointer form — the
 *  real checksum/length validation is `userKey.ts`'s `npubDecode` in the
 *  resolver. This just filters obvious garbage and caps length on
 *  unauthenticated deep-link input (an npub is ~63 chars; 90 = headroom).
 *  Mirror of `verifiedPageHandler.ts`'s scanner-side gate. */
const NPUB_RE = /^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/u;
const MAX_NPUB_LENGTH = 90;

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/u;

function parseVerifiedHandleRoute(
  productHost: boolean,
  segments: readonly string[],
  hash: string
): DeepLinkRoute | null {
  const segment = segments[0];
  if (!productHost || hash.length > 0 || segments.length !== 1 || !segment?.startsWith('@')) {
    return null;
  }

  let handle: string;
  try {
    handle = decodeURIComponent(segment.slice(1));
  } catch {
    return null;
  }
  return matchHandleResolver(handle, DEFAULT_HANDLE_RESOLVERS) === undefined
    ? null
    : { kind: 'verifiedHandle', handle };
}

/**
 * The `https://<product-host>/websign#req=<X>` fragment form of the App↔Web
 * signing request (research §4). Split out to keep `parseVerifiedDomainRoute`
 * under the cyclomatic-complexity budget. `null` = no usable `req` → the
 * caller falls through to `unknown` (never to the Verified Page fragment
 * branch, which the `/websign` path already excluded).
 */
function parseWebSignDomainRoute(hash: string): DeepLinkRoute | null {
  if (hash.length <= 1) return null;
  const req = new URLSearchParams(hash.slice(1)).get(WEBSIGN_REQUEST_PARAM);
  return req !== null && req.length > 0 ? { kind: 'webSign', request: req } : null;
}

/**
 * `https://<verified-domain>/...` routes only — split out of `parseDeepLink`
 * to keep that function's cyclomatic complexity under budget as this branch
 * grows (card link, Verified Page fragment link). `null` means "recognised host, but no known route" — falls
 * through to `unknown` at the call site.
 */
function parseVerifiedDomainRoute(url: URL, devProductHosts: boolean): DeepLinkRoute | null {
  const segments = url.pathname.replace(/^\//u, '').split('/');
  // `isVerifiedDomain` (the gate the caller already applied to reach this
  // function) also allowlists third-party identity hosts — apple.com,
  // google.com, microsoft.com, github.com, linkedin.com — trusted for a
  // DIFFERENT purpose (OIDC/domain verification). An in-app routing side
  // effect (card connect) must only fire on hosts WE own, so the `card`
  // branch below additionally requires `isProductHost`.
  // Code-review Finding 1, Task A5.4 follow-up. `devProductHosts`
  // (= developerMode, threaded by the caller) additionally admits
  // `DEV_PRODUCT_HOSTS` — empty since creds.id went production 2026-08-30.
  const productHost = isProductHost(url.host, devProductHosts);
  if (productHost && segments[0] === 'c' && segments[1] && UUID_RE.test(segments[1])) {
    return { kind: 'card', cardId: segments[1] };
  }
  // `https://<product-host>/websign#req=<X>` (research §4) — the fragment form
  // of the App↔Web signing request, so `req` never leaves the device over the
  // network. Checked BEFORE the generic `#<fragment>` branch
  // below (which would otherwise swallow `#req=…` as a Verified Page blob) and
  // distinguished from it by the `/websign` path segment. Returns a sentinel
  // for "recognised /websign path" so a missing `req` fails to `unknown`
  // rather than falling through to the fragment branch.
  if (productHost && segments.length === 1 && segments[0] === WEBSIGN_DEEPLINK_HOST) {
    return parseWebSignDomainRoute(url.hash);
  }
  const handleRoute = parseVerifiedHandleRoute(productHost, segments, url.hash);
  if (handleRoute !== null) return handleRoute;
  // Verified Page link: `https://creds.id/#<fragment>`
  // — the fragment never leaves the device over the network,
  // so this is just recognising the shape and handing the raw fragment blob
  // to the same local-only verify pipeline the scanner uses
  // (`src/scan/verifiedPageHandler.ts`'s `verifyFragment`).
  if (url.hash.length > 1) {
    const hash = url.hash.slice(1);
    // Short-pointer form `#nostr:<npub>` — resolved asynchronously against
    // relays (`resolveProfile.ts`), unlike the self-contained offline blob.
    if (hash.startsWith('nostr:')) {
      const npub = hash.slice('nostr:'.length);
      // A `nostr:` prefix but a non-npub tail is NOT a fragment — fail to
      // `unknown` rather than mis-decoding `nostr:garbage` as a blob.
      return NPUB_RE.test(npub) && npub.length <= MAX_NPUB_LENGTH
        ? { kind: 'verifiedPointer', npub }
        : null;
    }
    return { kind: 'verifiedProfile', fragment: hash };
  }
  return null;
}

/**
 * `credsid://…` (and legacy `solidarity://…` / `airmeishi://…`) routes only — split out of
 * `parseDeepLink` for the same reason `parseVerifiedDomainRoute` above was:
 * keep that function's cyclomatic complexity under budget as this branch
 * grows (card / group). `null` means
 * "recognised host, but no known route" — falls through to `unknown` at the
 * call site.
 */
function parseCustomSchemeRoute(url: URL): DeepLinkRoute | null {
  const segments = url.pathname.replace(/^\//u, '').split('/');
  const [first] = segments;
  if (url.host === 'card' && first && UUID_RE.test(first)) {
    return { kind: 'card', cardId: first };
  }
  if (url.host === 'group' && first) {
    return { kind: 'groupInvite', token: first };
  }
  // `solidarity://websign?req=<X>` (research §4, App↔Web per-action signing) —
  // the same-device "deep link out" transport. `req` is the raw request
  // compact JWS or its compressed fragment form; it is decoded + verified by
  // the review flow, never trusted here. The web session signature does NOT
  // prove origin — the app's human-reviewed diff is the security boundary.
  if (url.host === WEBSIGN_DEEPLINK_HOST) {
    const req = url.searchParams.get(WEBSIGN_REQUEST_PARAM);
    return req !== null && req.length > 0 ? { kind: 'webSign', request: req } : null;
  }
  return null;
}

export interface ParseDeepLinkOptions {
  /**
   * Thread `usePreferences.getState().developerMode` here: in dev mode any
   * `DEV_PRODUCT_HOSTS` entry (a pre-launch product domain) counts as a
   * product host so its link surface can be exercised before launch
   * (05-spec §8-B mechanism; empty since creds.id went production). The
   * parser stays pure — it never reads the preferences store itself.
   */
  readonly devProductHosts?: boolean;
}

export function parseDeepLink(raw: string, options: ParseDeepLinkOptions = {}): DeepLinkRoute {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { kind: 'unknown', raw };
  }

  // Android `singleTask` activities replay the original launch intent on every
  // resume from the launcher. If that intent was an OID4VP / OID4VCI URL, the
  // app re-routes into the credential flow on every cold start. Treat empty-
  // query URLs as stale launch intents — a real offer always carries a payload.
  if (url.protocol === 'openid4vp:' || url.protocol === 'openid-vp:') {
    const query = url.searchParams.toString();
    return query.length === 0 ? { kind: 'unknown', raw } : { kind: 'oidc', query };
  }
  if (url.protocol === 'openid-credential-offer:') {
    const query = url.searchParams.toString();
    const hasOfferPayload =
      url.searchParams.has('credential_offer') || url.searchParams.has('credential_offer_uri');
    return query.length === 0 || !hasOfferPayload
      ? { kind: 'unknown', raw }
      : { kind: 'credentialOffer', query };
  }

  if (isAppSchemeProtocol(url.protocol)) {
    const route = parseCustomSchemeRoute(url);
    if (route !== null) return route;
  }

  if (url.protocol === 'https:' && isVerifiedDomain(url.host)) {
    const route = parseVerifiedDomainRoute(url, options.devProductHosts ?? false);
    if (route !== null) return route;
  }

  return { kind: 'unknown', raw };
}
