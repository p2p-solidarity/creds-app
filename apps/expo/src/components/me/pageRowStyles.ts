/**
 * Shared row metrics for the Page tab. The surface follows creds.id's builder
 * (`airmeishi-web` `.lrow`: card rows on a hairline divider, 36pt round
 * brand-tinted tile, 12pt gutter — the web wins over the old mock's borderless
 * `mutedSurface` rows), but the densities deliberately run tighter than the
 * web's 64pt — compacted 2026-08-30 on a direct product call, so don't
 * "restore" them.
 */
import type { ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';

import { normalizeAtprotoHandle } from '@solidarity/shared';

import { Radius } from '@/constants/radius';

/** `.field` / `.blk` bottom margin — grouping by space, not by lines. */
export const ROW_GAP = 6;
/** App rows are cards (`--radius-card`). The public page uses its own per-template radius. */
export const ROW_RADIUS = Radius.card;
/** `.f-ico` — round icon tile and the glyph it frames. */
export const ICON_TILE_SIZE = 36;
export const ICON_TILE_GLYPH = 18;
/** Row heights. The drag strides below must stay derived from these — the
 * reorder math reads a row's travel as height + gap, so a height edited
 * without its stride desyncs the drop slot from what the finger sees. */
export const FIELD_ROW_HEIGHT = 54;
export const BLOCK_ROW_HEIGHT = 48;
export const FIELD_ROW_STRIDE = FIELD_ROW_HEIGHT + ROW_GAP;
export const BLOCK_ROW_STRIDE = BLOCK_ROW_HEIGHT + ROW_GAP;

/** One row's travel (its measured height + the gap), or `stride` while the
 * row has not been measured. Rows may differ in height — a link row grows a
 * verify banner — so the drag reads each slot instead of one fixed stride. */
export function rowSlot(heights: readonly number[], index: number, stride: number): number {
  'worklet';
  const height = heights[index] ?? 0;
  return height > 0 ? height + ROW_GAP : stride;
}

/** Signed distance from `sourceIndex`'s slot to `destinationIndex`'s. */
export function slotOffset(
  heights: readonly number[],
  sourceIndex: number,
  destinationIndex: number,
  stride: number,
): number {
  'worklet';
  let offset = 0;
  for (let i = sourceIndex + 1; i <= destinationIndex; i++) offset += rowSlot(heights, i, stride);
  for (let i = destinationIndex; i < sourceIndex; i++) offset -= rowSlot(heights, i, stride);
  return offset;
}

/** The slot a vertical drag resolves to, for rows of different heights: the hand-off to a
 * neighbour happens once the drag has crossed half of that neighbour. */
export function dragDestinationForSlots(
  sourceIndex: number,
  translationY: number,
  itemCount: number,
  heights: readonly number[],
  stride: number,
): number {
  'worklet';
  let destination = sourceIndex;
  let travelled = 0;
  if (translationY > 0) {
    for (let i = sourceIndex + 1; i < itemCount; i++) {
      const slot = rowSlot(heights, i, stride);
      if (translationY < travelled + slot / 2) break;
      travelled += slot;
      destination = i;
    }
  } else {
    for (let i = sourceIndex - 1; i >= 0; i--) {
      const slot = rowSlot(heights, i, stride);
      if (-translationY < travelled + slot / 2) break;
      travelled += slot;
      destination = i;
    }
  }
  return destination;
}

/** Immutable reorder shared by link and Page-block drag handles. */
export function reorderByIndex<T>(
  items: readonly T[],
  sourceIndex: number,
  destinationIndex: number,
): readonly T[] {
  if (
    sourceIndex === destinationIndex ||
    sourceIndex < 0 ||
    destinationIndex < 0 ||
    sourceIndex >= items.length ||
    destinationIndex >= items.length
  ) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  if (moved === undefined) return items;
  next.splice(destinationIndex, 0, moved);
  return next;
}

export type RowVerificationPill = 'verified' | 'needsRecheck';

/** Only an affirmative check earns a green pill. A stale completed check can
 * ask for re-verification; declared/revoked results stay unlabelled because
 * calling either one "verified" or merely "waiting" would be dishonest. */
export function verificationPillForStates(
  states: readonly string[],
): RowVerificationPill | null {
  if (states.includes('verified')) return 'verified';
  return states.includes('stale') ? 'needsRecheck' : null;
}

/** `.field` — link/field row, 10pt gutter between icon / text / trailing glyph. */
/** The two theme colours a row surface needs (pass `useThemeColors()`). */
export interface RowSurfaceColors {
  readonly cardBg: string;
  readonly divider: string;
}

export function fieldRowStyle(c: RowSurfaceColors): ViewStyle {
  return {
    minHeight: FIELD_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: ROW_RADIUS,
    backgroundColor: c.cardBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.divider,
  };
}

/** `.blk` — the same surface at block-row density. */
export function blockRowStyle(c: RowSurfaceColors): ViewStyle {
  return {
    minHeight: BLOCK_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: ROW_RADIUS,
    backgroundColor: c.cardBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.divider,
  };
}

/** `.f-ico` — round, brand-tinted icon tile. */
export function iconTileStyle(surface: string): ViewStyle {
  return {
    width: ICON_TILE_SIZE,
    height: ICON_TILE_SIZE,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: surface,
  };
}

/**
 * Hosts that render a Nostr profile AT a bare npub. A cached binding proves
 * "this npub is mine"; it says nothing about an unrelated page that merely
 * carries the npub somewhere in its path. Matching any segment on any host
 * would hand a green tick to `example.com/notes/npub1…`.
 */
const NOSTR_PROFILE_HOSTS: ReadonlySet<string> = new Set([
  'njump.me',
  'primal.net',
  'snort.social',
  'iris.to',
  'nostrudel.ninja',
  'coracle.social',
  'nostr.band',
]);

/** Does this URL identify `npub` as a profile, rather than just mention it? */
export function isNostrProfileUrlForNpub(
  url: URL,
  hostname: string,
  path: readonly string[],
  npub: string
): boolean {
  if (url.protocol === 'nostr:') return url.pathname === npub;
  return NOSTR_PROFILE_HOSTS.has(hostname) && path[path.length - 1] === npub;
}

/**
 * Does the record STILL claim this ATProto handle? A cached check describes
 * the handle it ran against; once the record stops claiming it, the result
 * describes nothing the page asserts any more.
 */
export function recordClaimsAtprotoHandle(
  alsoKnownAs: readonly string[],
  handle: string
): boolean {
  const wanted = normalizeAtprotoHandle(handle);
  return alsoKnownAs.some(
    (claim) => claim.startsWith('at://') &&
      normalizeAtprotoHandle(claim.slice('at://'.length)) === wanted
  );
}
