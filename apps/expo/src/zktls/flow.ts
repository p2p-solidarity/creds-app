/**
 * What happens around a link check (docs/ref/10 §3.11):
 *
 *   confirmSocialClaim  the owner taps 「加上綠勾」: the Page is re-signed with
 *                       the claim (the flow's one Face ID), then the Page and
 *                       the self-witness are published.
 *   renewDueProofs      on foreground, checks older than 30 days are redone
 *                       silently (npub + device key, no Face ID) and
 *                       republished; the Page is not touched. A failure is
 *                       told once.
 */
import { DEFAULT_RELAYS } from '@/nostr/publish';
import type { NostrEvent } from '@/nostr/nostrAdapter';
import { useProfileStore } from '@/profile/store';
import { usePreferences } from '@/settings/preferences';
import { isProActive } from '@/pro/entitlement';
import { selectProStatus, useProEntitlementStore } from '@/pro/entitlementStore';
import { queueNotaryWitness } from '@/pro/license';
import { publishWitness } from '@/witness/witness';
import {
  CREDS_DEVICE_TRUST,
  err,
  ok,
  socialTargetForClaim,
  verifyWitness,
  type NostrEvent as SharedNostrEvent,
  type Result,
} from '@solidarity/shared';

import { currentNpub, proveSocialTarget } from './engine';
import { proofAge, useZktlsProofs } from './store';

export type ConfirmFailure = 'noProfile' | 'noNostrKey' | 'signDenied' | 'invalidProof';

export interface ConfirmOutcome {
  /** False when the Page or the check did not reach a relay quorum; the claim is still saved locally. */
  readonly published: boolean;
}

export async function confirmSocialClaim(event: NostrEvent): Promise<Result<ConfirmOutcome, ConfirmFailure>> {
  const { record, linkVisibility, saveProfile, publishToNostr } = useProfileStore.getState();
  if (record === null) return err('noProfile');
  const npub = await currentNpub();
  if (!npub.ok) return err('noNostrKey');
  const verified = verifyWitness(event as SharedNostrEvent, CREDS_DEVICE_TRUST);
  if (!verified.ok || verified.value.statement.subject !== npub.value || !verified.value.self) return err('invalidProof');

  const claim = verified.value.statement.claim;
  const npubClaim = `nostr:${npub.value}`;
  const alsoKnownAs = [...record.alsoKnownAs];
  for (const entry of [npubClaim, claim]) if (!alsoKnownAs.includes(entry)) alsoKnownAs.push(entry);

  if (alsoKnownAs.length !== record.alsoKnownAs.length) {
    const saved = await saveProfile(
      { displayName: record.displayName, bio: record.bio, links: record.links, linkVisibility },
      { alsoKnownAs },
    );
    if (!saved.ok) return err('signDenied');
  }
  useZktlsProofs.getState().put(claim, event, verified.value.statement.observedAt);

  const [page, published] = await Promise.all([publishToNostr(DEFAULT_RELAYS), publishWitness(event, DEFAULT_RELAYS)]);
  // Pro: one more witness, from the creds.id notary, in its next hourly batch.
  const jws = useProfileStore.getState().jws;
  const name = usePreferences.getState().publicPageRegisteredUsername;
  if (isProActive(selectProStatus(useProEntitlementStore.getState())) && jws !== null && name !== '') {
    void queueNotaryWitness({ jws, name });
  }
  return ok({ published: page.ok && published.success });
}

const RENEWAL_THROTTLE_MS = 60 * 60_000;
let lastRenewalRun = 0;
let renewing = false;

/**
 * Re-check every claim past 30 days that the Page still makes. Returns the
 * claims whose renewal failed for the first time (the caller tells the owner
 * once); quiet otherwise.
 */
export async function renewDueProofs(nowMs: number = Date.now()): Promise<readonly string[]> {
  if (renewing || nowMs - lastRenewalRun < RENEWAL_THROTTLE_MS) return [];
  renewing = true;
  lastRenewalRun = nowMs;
  const newlyFailed: string[] = [];
  try {
    const record = useProfileStore.getState().record;
    const name = usePreferences.getState().publicPageRegisteredUsername;
    if (record === null || name === '') return [];
    for (const [claim, entry] of Object.entries(useZktlsProofs.getState().proofs)) {
      const target = socialTargetForClaim(claim);
      if (!record.alsoKnownAs.includes(claim) || target === null) {
        useZktlsProofs.getState().remove(claim);
        continue;
      }
      if (proofAge(entry, nowMs) === 'fresh') continue;
      const renewed = await proveSocialTarget(target, name);
      if (renewed.ok) {
        useZktlsProofs.getState().put(claim, renewed.value, renewed.value.created_at);
        await publishWitness(renewed.value, DEFAULT_RELAYS);
        continue;
      }
      if (!entry.renewalFailedNotified) {
        useZktlsProofs.getState().markRenewalFailed(claim);
        newlyFailed.push(claim);
      }
    }
    return newlyFailed;
  } finally {
    renewing = false;
  }
}
