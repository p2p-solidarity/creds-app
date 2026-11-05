/**
 * The Me › Edit draft: unsaved name / bio / link edits kept on this phone so
 * leaving the editor never loses them. Local only (MMKV, wiped with the rest
 * of local data); nothing here is signed or published.
 *
 * A draft remembers the signed record it started from (`base`, the JWS). If
 * the record changed since (a save from another screen or device restore),
 * the draft is stale and is dropped instead of silently overwriting it.
 */
import type { LinkLabelPreset } from '@/profile/linkUrl';
import type { LinkVisibility } from '@/profile/projection';
import { getMmkv } from '@/storage/mmkv';

const PROFILE_DRAFT_KEY = 'profile:editDraft:v1';

export interface ProfileDraftLink {
  readonly label: string;
  readonly url: string;
  readonly preset: LinkLabelPreset | null;
  readonly visibility: LinkVisibility;
}

export interface ProfileDraft {
  readonly base: string | null;
  readonly displayName: string;
  readonly bio: string;
  readonly links: readonly ProfileDraftLink[];
}

const VISIBILITIES: ReadonlySet<string> = new Set(['public', 'link-only', 'private']);

function isDraftLink(value: unknown): value is ProfileDraftLink {
  if (typeof value !== 'object' || value === null) return false;
  const link = value as Partial<Record<keyof ProfileDraftLink, unknown>>;
  return typeof link.label === 'string'
    && typeof link.url === 'string'
    && (link.preset === null || typeof link.preset === 'string')
    && typeof link.visibility === 'string' && VISIBILITIES.has(link.visibility);
}

/** The draft for `base`, or null when there is none, it is unreadable, or it
 *  was made against a different signed record. */
export function loadProfileDraft(base: string | null): ProfileDraft | null {
  try {
    const raw = getMmkv().getString(PROFILE_DRAFT_KEY);
    if (raw === undefined) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const draft = parsed as Partial<Record<keyof ProfileDraft, unknown>>;
    if (draft.base !== base) {
      clearProfileDraft();
      return null;
    }
    if (typeof draft.displayName !== 'string' || typeof draft.bio !== 'string') return null;
    if (!Array.isArray(draft.links) || !draft.links.every(isDraftLink)) return null;
    return { base, displayName: draft.displayName, bio: draft.bio, links: draft.links };
  } catch {
    return null;
  }
}

/** Best effort: a draft that cannot be written only loses the safety net. */
export function saveProfileDraft(draft: ProfileDraft): void {
  try {
    getMmkv().set(PROFILE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // MMKV not ready — the in-memory edits are still on screen.
  }
}

export function clearProfileDraft(): void {
  try {
    getMmkv().remove(PROFILE_DRAFT_KEY);
  } catch {
    // Nothing persisted to clear.
  }
}
