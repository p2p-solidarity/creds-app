/**
 * Which Page links the zkTLS engine can verify (docs/ref/10 §2 step ②). Pure
 * URL parsing, shared so the app (which proves) and creds.id (which shows the
 * owner each link's state) agree on what counts as a verifiable link.
 */
import { isAllowedWebsiteHost, ZKTLS_PLATFORMS } from './platforms';
import type { ZktlsSocialPlatform } from './socialProof';

export interface SocialTarget {
  readonly platform: ZktlsSocialPlatform;
  readonly handle: string;
}

/** First path segments that are app pages, not profiles. */
const RESERVED_PATHS: Readonly<Record<'x' | 'telegram' | 'github', ReadonlySet<string>>> = {
  x: new Set(['home', 'i', 'intent', 'search', 'settings', 'explore', 'notifications', 'messages', 'share', 'hashtag']),
  telegram: new Set(['s', 'joinchat', 'addstickers', 'share', 'proxy', 'c']),
  github: new Set(['settings', 'orgs', 'topics', 'explore', 'marketplace', 'sponsors', 'login', 'about']),
};

const HOST_PLATFORM: Readonly<Record<string, 'x' | 'telegram' | 'github'>> = {
  'x.com': 'x',
  'twitter.com': 'x',
  't.me': 'telegram',
  'telegram.me': 'telegram',
  'github.com': 'github',
};

/** Social hosts that have no zkTLS rule yet — never treated as "a website". */
const OTHER_PLATFORM_HOSTS = new Set([
  'instagram.com', 'threads.com', 'threads.net', 'linkedin.com', 'youtube.com', 'bsky.app',
  'facebook.com', 'tiktok.com', 'creds.id', 't.co',
]);

export function socialTargetForLink(rawUrl: string): SocialTarget | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^(www|mobile|m)\./u, '');
  const platform = HOST_PLATFORM[host];
  if (platform !== undefined) {
    const segments = url.pathname.split('/').filter(Boolean);
    const handle = (segments[0] ?? '').replace(/^@/u, '');
    if (segments.length !== 1 || RESERVED_PATHS[platform].has(handle.toLowerCase())) return null;
    return ZKTLS_PLATFORMS[platform].handlePattern.test(handle) ? { platform, handle } : null;
  }
  if (OTHER_PLATFORM_HOSTS.has(host) || [...OTHER_PLATFORM_HOSTS].some((h) => host.endsWith(`.${h}`))) return null;
  const site = url.hostname.toLowerCase();
  return isAllowedWebsiteHost(site) ? { platform: 'website', handle: site } : null;
}
