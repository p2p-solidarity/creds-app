/**
 * What happens around a proof (docs/ref/10 §2 step ④, D5):
 *
 *   confirmSocialClaim  the owner taps 「加上綠勾」: the Page is re-signed with
 *                       the claim (the flow's one Face ID), then the Page and
 *                       the proof are published.
 *   renewDueProofs      on foreground, proofs older than 30 days are re-proven
 *                       silently (npub-signed, no Face ID) and republished;
 *                       the Page is not touched. A failure is told once.
 */
import { DEFAULT_RELAYS, publishSocialProof } from '@/nostr/publish';
import { useProfileStore } from '@/profile/store';
import { usePreferences } from '@/settings/preferences';
import {
  CREDS_NOTARY_ROOTS,
  err,
  ok,
  pageSocialClaim,
  verifySocialProof,
  type Result,
  type SocialProof,
} from '@solidarity/shared';

import { currentNpub, proveSocialTarget } from './engine';
import { proofAge, useZktlsProofs } from './store';

export type ConfirmFailure = 'noProfile' | 'noNostrKey' | 'signDenied' | 'invalidProof';

export interface ConfirmOutcome {
  /** False when the Page or proof did not reach a relay quorum; the claim is still saved locally. */
  readonly published: boolean;
}

export async function confirmSocialClaim(proof: SocialProof): Promise<Result<ConfirmOutcome, ConfirmFailure>> {
  const { record, linkVisibility, saveProfile, publishToNostr } = useProfileStore.getState();
  if (record === null) return err('noProfile');
  const npub = await currentNpub();
  if (!npub.ok) return err('noNostrKey');
  const verified = verifySocialProof(proof, npub.value, { roots: CREDS_NOTARY_ROOTS });
  if (!verified.ok) return err('invalidProof');

  const claim = pageSocialClaim(proof.platform, proof.handle);
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
  useZktlsProofs.getState().put(proof, verified.value.verifiedAt);

  const [page, published] = await Promise.all([
    publishToNostr(DEFAULT_RELAYS),
    publishSocialProof({ proof, relays: DEFAULT_RELAYS }),
  ]);
  return ok({ published: page.ok && published.ok && published.value.success });
}

const RENEWAL_THROTTLE_MS = 60 * 60_000;
let lastRenewalRun = 0;
let renewing = false;

/**
 * Re-prove every claim past 30 days that the Page still makes. Returns the
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
      if (!record.alsoKnownAs.includes(claim)) {
        useZktlsProofs.getState().remove(claim);
        continue;
      }
      if (proofAge(entry, nowMs) === 'fresh') continue;
      const renewed = await proveSocialTarget({ platform: entry.proof.platform, handle: entry.proof.handle }, name);
      if (renewed.ok) {
        const npub = await currentNpub();
        const verified = npub.ok ? verifySocialProof(renewed.value, npub.value, { roots: CREDS_NOTARY_ROOTS }) : null;
        if (verified?.ok) {
          useZktlsProofs.getState().put(renewed.value, verified.value.verifiedAt);
          await publishSocialProof({ proof: renewed.value, relays: DEFAULT_RELAYS });
          continue;
        }
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
