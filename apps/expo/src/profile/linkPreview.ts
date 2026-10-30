/**
 * Link preview — the picture a link row shows: the site's icon, its share
 * image, and (for a social profile page) the owner's avatar.
 *
 * The page is someone else's HTML, and every URL it names becomes an image
 * this phone loads, so: the page itself is fetched through the https-only /
 * no-private-IP guard on every redirect hop (`createPublicPageFetch`), and
 * every image URL it yields passes the same `publicHttpsUrl` check — http,
 * data:, javascript:, localhost and IP literals are dropped, never "fixed".
 *
 * `avatar` is only filled for social profile pages, where `og:image` is the
 * profile picture; a website's `og:image` is a cover image and stays `image`.
 * GitHub avatars come straight from the handle (`github.com/<h>.png`).
 *
 * Results are local-only (`linkPreviewStore`); nothing here is signed into
 * the Page.
 */
import { err, ok, type PageFetch, type Result } from '@solidarity/shared';

import { createPublicPageFetch, publicHttpsUrl } from '@/profile/httpsOwnership';
import { linkPresetForHostname, type LinkLabelPreset } from '@/profile/linkUrl';

export interface LinkPreview {
  /** Site icon (apple-touch-icon → icon → /favicon.ico). */
  readonly icon: string | null;
  /** The page's share image (`og:image` / `twitter:image`). */
  readonly image: string | null;
  /** The profile picture, for social profile pages only. */
  readonly avatar: string | null;
}

export type LinkPreviewError = 'unreachable';

/** Platforms whose public profile page's og:image is the owner's avatar. */
const SOCIAL_PRESETS: ReadonlySet<LinkLabelPreset> = new Set(['x', 'instagram', 'telegram', 'github', 'linkedin', 'youtube']);

const GITHUB_HANDLE_RE = /^\/([A-Za-z0-9-]{1,39})\/?$/u;

function safeImageUrl(raw: string | undefined, base: string): string | null {
  if (raw === undefined) return null;
  const decoded = decodeEntities(raw.trim());
  if (decoded.length === 0) return null;
  return publicHttpsUrl(decoded, base)?.href ?? null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>');
}

/** Tags only: comments and raw-text elements never contribute. */
function activeTags(html: string, name: 'meta' | 'link'): readonly Readonly<Record<string, string>>[] {
  const active = html
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<(script|style|template|textarea|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, '');
  const tags: Record<string, string>[] = [];
  const tagRe = new RegExp(`<${name}\\b([^>]*)>`, 'giu');
  const attrRe = /([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gu;
  for (const tag of active.matchAll(tagRe)) {
    const attrs: Record<string, string> = {};
    for (const attr of (tag[1] ?? '').matchAll(attrRe)) {
      const key = (attr[1] ?? '').toLowerCase();
      attrs[key] = attr[2] ?? attr[3] ?? attr[4] ?? '';
    }
    tags.push(attrs);
  }
  return tags;
}

function presetFor(pageUrl: string): LinkLabelPreset | null {
  try {
    return linkPresetForHostname(new URL(pageUrl).hostname);
  } catch {
    return null;
  }
}

export function parseLinkPreview(html: string, pageUrl: string): LinkPreview {
  const metas = activeTags(html, 'meta');
  const metaContent = (...keys: readonly string[]): string | undefined => {
    for (const key of keys) {
      const hit = metas.find((m) => (m['property'] ?? m['name'] ?? '').toLowerCase() === key);
      if (hit?.['content'] !== undefined) return hit['content'];
    }
    return undefined;
  };
  const image = safeImageUrl(metaContent('og:image', 'og:image:url', 'twitter:image'), pageUrl);

  const links = activeTags(html, 'link');
  const iconHref = (rel: string): string | undefined =>
    links.find((l) => (l['rel'] ?? '').toLowerCase().split(/\s+/u).includes(rel))?.['href'];
  const icon =
    safeImageUrl(iconHref('apple-touch-icon'), pageUrl) ??
    safeImageUrl(iconHref('icon'), pageUrl) ??
    safeImageUrl('/favicon.ico', pageUrl);

  const preset = presetFor(pageUrl);
  const avatar = preset !== null && SOCIAL_PRESETS.has(preset) ? image : null;
  return { icon, image, avatar };
}

let defaultFetch: PageFetch | null = null;
function publicPageFetch(): PageFetch {
  if (defaultFetch === null) {
    // `expo/fetch` honours `redirect: 'manual'` (RN's global fetch does not),
    // which the per-hop guard needs. Loaded lazily so tests import this file.
     
    const { fetch: expoFetch } = require('expo/fetch') as typeof import('expo/fetch');
    defaultFetch = createPublicPageFetch(expoFetch);
  }
  return defaultFetch;
}

export async function fetchLinkPreview(
  rawUrl: string,
  fetchPage: PageFetch = publicPageFetch(),
): Promise<Result<LinkPreview, LinkPreviewError>> {
  const url = publicHttpsUrl(rawUrl);
  if (url === null) return err('unreachable');
  if (presetFor(url.href) === 'github') {
    const handle = GITHUB_HANDLE_RE.exec(url.pathname)?.[1];
    if (handle !== undefined) {
      return ok({ icon: 'https://github.com/favicon.ico', image: null, avatar: `https://github.com/${handle}.png` });
    }
  }
  const page = await fetchPage(url.href);
  if (!page.ok || page.value.status !== 200) return err('unreachable');
  return ok(parseLinkPreview(page.value.body, url.href));
}
