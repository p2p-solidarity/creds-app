/**
 * What a Page item's URL becomes on the creds.id visitor page beyond a link
 * row — a port of airmeishi-web `src/page/richMedia.ts` (classification only;
 * change both together). The signed Page schema is `.strict()`, so a "rich"
 * block is an ordinary `video` / `featured` block whose item URL is
 * recognised here: a Spotify item in either, a YouTube video or channel in
 * `video` (web `RichBlocks.richMediaFor`). The add sheet uses it to offer a
 * player, the preview to draw one.
 */

export type SpotifyKind = 'track' | 'album' | 'playlist' | 'artist';

export type RichMedia =
  | { readonly kind: 'youtube-channel'; readonly handle?: string; readonly channelId?: string; readonly url: string }
  | { readonly kind: 'youtube-video'; readonly videoId: string }
  | { readonly kind: 'spotify'; readonly type: SpotifyKind; readonly id: string };

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/u;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/u;
// Handles are 3–30 letters/digits (any script), `_`, `-`, `.`.
const HANDLE = /^[\p{L}\p{N}._-]{3,30}$/u;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/u;
const SPOTIFY_KINDS: readonly SpotifyKind[] = ['track', 'album', 'playlist', 'artist'];

export function isYoutubeVideoId(value: string): boolean {
  return VIDEO_ID.test(value);
}

export function isYoutubeChannelId(value: string): boolean {
  return CHANNEL_ID.test(value);
}

function parse(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function classifyYoutube(url: URL): RichMedia | null {
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);
  if (host === 'youtu.be') {
    const id = segments[0];
    return id && segments.length === 1 && VIDEO_ID.test(id) ? { kind: 'youtube-video', videoId: id } : null;
  }
  if (!YOUTUBE_HOSTS.has(host) || url.port !== '') return null;
  const [first, second] = segments;
  if (first === 'watch' && segments.length === 1) {
    const id = url.searchParams.get('v');
    return id && VIDEO_ID.test(id) ? { kind: 'youtube-video', videoId: id } : null;
  }
  if ((first === 'shorts' || first === 'live' || first === 'embed') && second && segments.length === 2) {
    return VIDEO_ID.test(second) ? { kind: 'youtube-video', videoId: second } : null;
  }
  if (first === 'channel' && second && CHANNEL_ID.test(second)) {
    return { kind: 'youtube-channel', channelId: second, url: `https://www.youtube.com/channel/${second}` };
  }
  if (first?.startsWith('@')) {
    const handle = decodeSegment(first.slice(1));
    if (handle === null || !HANDLE.test(handle)) return null;
    return { kind: 'youtube-channel', handle, url: `https://www.youtube.com/@${encodeURIComponent(handle)}` };
  }
  return null;
}

function classifySpotify(url: URL): RichMedia | null {
  if (url.hostname.toLowerCase() !== 'open.spotify.com' || url.port !== '') return null;
  const segments = url.pathname.split('/').filter(Boolean);
  // Localised share links carry a leading `intl-xx` segment.
  if (segments[0]?.startsWith('intl-')) segments.shift();
  const [type, id] = segments;
  if (segments.length !== 2 || !type || !id) return null;
  const kind = SPOTIFY_KINDS.find((candidate) => candidate === type);
  return kind && SPOTIFY_ID.test(id) ? { kind: 'spotify', type: kind, id } : null;
}

/** The rich form of a URL, or `null` when it is just a link. */
export function classifyMediaUrl(raw: string | undefined): RichMedia | null {
  const url = parse(raw);
  if (url === null || url.username !== '' || url.password !== '') return null;
  return classifyYoutube(url) ?? classifySpotify(url);
}

/** One identity per channel / video / Spotify entity, whatever URL spelling was used. */
export function mediaKey(media: RichMedia): string {
  switch (media.kind) {
    case 'youtube-channel':
      return media.channelId ? `yt-channel:${media.channelId}` : `yt-handle:${media.handle?.toLowerCase()}`;
    case 'youtube-video':
      return `yt-video:${media.videoId}`;
    case 'spotify':
      return `spotify:${media.type}:${media.id}`;
  }
}

/** Mirrors web `richMediaFor`: which media a block of this type plays. */
export function richMediaForBlock(blockType: string, url: string | undefined): RichMedia | null {
  if (blockType !== 'video' && blockType !== 'featured') return null;
  const media = classifyMediaUrl(url);
  if (media === null) return null;
  return blockType === 'video' || media.kind === 'spotify' ? media : null;
}
