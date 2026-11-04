import {
  DEFAULT_HANDLE_RESOLVERS,
  NIP05_DOMAIN,
  classifyCredsPathSegment,
  matchHandleResolver,
} from '@solidarity/shared';

import { isProductHost } from './domainVerification';

/**
 * The handle a Page URL names, or null. `/@<handle>` works on every product
 * host; a bare `/<name>` only on creds.id itself — the other hosts' paths are
 * their own sites (docs/ref/15 §2). A hash makes it an offline Page link.
 */
export function handleFromProductUrl(url: URL, devProductHosts: boolean): string | null {
  if (url.protocol !== 'https:' || url.hash.length > 0 || !isProductHost(url.host, devProductHosts)) {
    return null;
  }
  const segments = url.pathname.replace(/^\//u, '').split('/');
  if (segments.length !== 1 || segments[0] === undefined) return null;
  let segment: string;
  try {
    segment = decodeURIComponent(segments[0]);
  } catch {
    return null;
  }
  const route = classifyCredsPathSegment(segment);
  if (route.kind === 'handle') {
    return matchHandleResolver(route.handle, DEFAULT_HANDLE_RESOLVERS) === undefined ? null : route.handle;
  }
  return route.kind === 'name' && url.host === NIP05_DOMAIN ? route.name : null;
}
