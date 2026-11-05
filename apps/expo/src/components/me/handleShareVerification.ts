/**
 * The real, cache-backed `HandleShareVerificationLookup` for the share UI
 * (`meProfileModel.ts`'s pure `preferredVerifiedHandleShareCandidate`).
 * Kept SEPARATE from `meProfileModel.ts` so the pure model stays free of
 * `@/badges/badgeStatusCache`'s lazy-MMKV side effect and stays trivially
 * unit-testable with fake lookups (`meProfileModel.test.ts`).
 *
 * A handle candidate is
 * VERIFIED only when there is a completed, still-fresh (`shouldReverifyBadge`
 * TTL) cached check whose claim matches the candidate's own handle. This
 * module never triggers a live check itself — it only reads whatever the
 * existing producers (`ProfileBadgeChips`'s focus effect, onboarding's
 * `badgeVerification.ts`) already wrote. Re-verifying here at share time
 * would fan out to the relays on every share.
 *
 * `ens`/`dns` always read as unverified: no producer populates a
 * per-scheme cache for the user's OWN profile yet (no DNS binding wizard) —
 * so these candidates can structurally never be offered today. That is the
 * correct fail-closed behaviour; once such a loop exists only this lookup
 * changes, never its pure caller.
 */
import {
  readCachedAtprotoResult,
  shouldReverifyBadge,
} from '@/badges/badgeStatusCache';
import { normalizeAtprotoHandle, type ProfileRecord } from '@solidarity/shared';

import {
  preferredVerifiedHandleShareCandidate,
  type HandleShareCandidate,
} from './meProfileModel';

/**
 * `handle` is already normalized (`atprotoHandleClaim`, lowercase, no `@`),
 * but `verifyAtprotoBinding`'s stored evidence keeps the claim RAW (exact
 * `alsoKnownAs` slice — see `packages/shared/src/badges/atproto.ts`'s
 * `extractHandleClaim`, and `ProfileBadgeChips.tsx`'s matching `handleClaim`
 * memo, which both compare raw-to-raw for that reason). Normalizing the
 * cached evidence before comparing here — rather than comparing raw to
 * normalized — avoids a false "not verified" for a claim written with
 * different case or a leading `@` (both valid per `isValidAtprotoHandle`).
 */
function isAtprotoHandleShareVerified(record: ProfileRecord, handle: string): boolean {
  const cached = readCachedAtprotoResult();
  if (cached === null) return false;
  const claim = cached.result.evidence.handleClaim;
  if (claim === null || normalizeAtprotoHandle(claim) !== handle) return false;
  if (cached.result.state !== 'verified') return false;
  return !shouldReverifyBadge(cached.checkedAt, record.updatedAt, Date.now());
}

export function isHandleShareCandidateVerified(
  record: ProfileRecord,
  candidate: HandleShareCandidate
): boolean {
  switch (candidate.scheme) {
    case 'atproto':
      return isAtprotoHandleShareVerified(record, candidate.handle);
    case 'ens':
    case 'dns':
      return false;
  }
}

/** The share UI's single entry point: the top/shortest verified handle
 *  link to offer, or `null` when none is currently verified. */
export function preferredVerifiedHandleShareUrl(
  record: ProfileRecord
): HandleShareCandidate | null {
  return preferredVerifiedHandleShareCandidate(record, (candidate) =>
    isHandleShareCandidateVerified(record, candidate)
  );
}
