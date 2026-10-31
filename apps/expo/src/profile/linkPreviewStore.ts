/**
 * Local cache of link previews (icon / share image / avatar), keyed by the
 * link's URL. Public data about public pages, never signed, so MMKV
 * plaintext is fine; entries older than a week are fetched again.
 *
 * `useLinkPreview(url)` is the one entry point: it paints a cached entry on
 * frame 1 (Rule 10) and otherwise starts one fetch per URL, however many rows
 * ask. The state is honest — `loading` / `ready` / `error` — and a row shows
 * its brand glyph for anything but `ready`.
 */
import { useEffect } from 'react';
import { create } from 'zustand';

import { fetchLinkPreview, type LinkPreview } from '@/profile/linkPreview';
import { getMmkv } from '@/storage/mmkv';

const KEY = 'linkPreview:v1';
const FRESH_MS = 7 * 86_400_000;
const MAX_ENTRIES = 200;

export type LinkPreviewState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly preview: LinkPreview }
  | { readonly status: 'error' };

interface Stored {
  readonly preview: LinkPreview;
  readonly fetchedAt: number;
}

interface LinkPreviewStore {
  readonly entries: Readonly<Record<string, LinkPreviewState>>;
  readonly load: (url: string) => void;
}

let hydrated = false;
let persisted: Record<string, Stored> = {};
const inFlight = new Set<string>();

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = getMmkv().getString(KEY);
    if (raw !== undefined) persisted = JSON.parse(raw) as Record<string, Stored>;
  } catch {
    persisted = {};
  }
}

function persist(url: string, preview: LinkPreview): void {
  persisted = { ...persisted, [url]: { preview, fetchedAt: Date.now() } };
  const keys = Object.keys(persisted);
  if (keys.length > MAX_ENTRIES) {
    const oldest = keys.sort((a, b) => (persisted[a]?.fetchedAt ?? 0) - (persisted[b]?.fetchedAt ?? 0));
    for (const key of oldest.slice(0, keys.length - MAX_ENTRIES)) delete persisted[key];
  }
  try {
    getMmkv().set(KEY, JSON.stringify(persisted));
  } catch {
    // MMKV unavailable: the in-memory entry still serves this run.
  }
}

export const useLinkPreviewStore = create<LinkPreviewStore>((set, get) => ({
  entries: {},
  load: (url) => {
    hydrate();
    const cached = persisted[url];
    if (cached !== undefined) {
      if (get().entries[url]?.status !== 'ready') {
        set({ entries: { ...get().entries, [url]: { status: 'ready', preview: cached.preview } } });
      }
      if (Date.now() - cached.fetchedAt < FRESH_MS) return;
    }
    if (inFlight.has(url)) return;
    inFlight.add(url);
    if (cached === undefined) set({ entries: { ...get().entries, [url]: { status: 'loading' } } });
    void fetchLinkPreview(url)
      .then((result) => {
        if (result.ok) {
          persist(url, result.value);
          set({ entries: { ...get().entries, [url]: { status: 'ready', preview: result.value } } });
        } else if (cached === undefined) {
          set({ entries: { ...get().entries, [url]: { status: 'error' } } });
        }
      })
      .finally(() => {
        inFlight.delete(url);
      });
  },
}));

const LOADING: LinkPreviewState = { status: 'loading' };

/** The preview for `url` (null = nothing to fetch yet). */
export function useLinkPreview(url: string | null): LinkPreviewState | null {
  const state = useLinkPreviewStore((s) => (url === null ? null : (s.entries[url] ?? LOADING)));
  const load = useLinkPreviewStore((s) => s.load);
  useEffect(() => {
    if (url !== null) load(url);
  }, [load, url]);
  return state;
}

/** One-shot read for flows that need the result, not a re-render. */
export async function resolveLinkPreview(url: string): Promise<LinkPreview | null> {
  hydrate();
  const cached = persisted[url];
  if (cached !== undefined) return cached.preview;
  const result = await fetchLinkPreview(url);
  if (!result.ok) return null;
  persist(url, result.value);
  return result.value;
}
