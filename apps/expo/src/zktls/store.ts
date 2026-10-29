/**
 * zkTLS proofs this device holds for its own Page (docs/ref/10 §2 step ④,
 * D5). One entry per Page claim (`x:@alice`), each a full `SocialProof` that
 * already verified end to end when it was stored.
 *
 * Age drives the badge (D5): < 30 days green; 30–90 days still green while
 * the background renewal retries; > 90 days the check lapses and the row
 * falls back to "needs recheck". The proof itself is public data (it is
 * published to Nostr), so MMKV plaintext is fine.
 *
 * Persisted at MMKV `zktls:proofs:v1`; hydrated once from the root layout
 * (Rule 10: in-memory default first, no await on first paint).
 */
import { create } from 'zustand';

import { canCommitLocalData, captureLocalDataEpoch } from '@/settings/localDataWipeBarrier';
import { getMmkv } from '@/storage/mmkv';
import { pageSocialClaim, type SocialProof } from '@solidarity/shared';

const KEY = 'zktls:proofs:v1';

export const RENEW_AFTER_MS = 30 * 86_400_000;
export const LAPSE_AFTER_MS = 90 * 86_400_000;

export interface StoredProof {
  readonly proof: SocialProof;
  /** Epoch ms the chain was witnessed (oldest piece). */
  readonly verifiedAt: number;
  /** Set once a background renewal failed and the owner was told; cleared on success. */
  readonly renewalFailedNotified?: boolean;
}

export type ProofAge = 'fresh' | 'renewing' | 'lapsed';

export function proofAge(entry: StoredProof, nowMs: number = Date.now()): ProofAge {
  const age = nowMs - entry.verifiedAt;
  if (age < RENEW_AFTER_MS) return 'fresh';
  return age < LAPSE_AFTER_MS ? 'renewing' : 'lapsed';
}

interface ZktlsProofState {
  readonly proofs: Readonly<Record<string, StoredProof>>;
  readonly put: (proof: SocialProof, verifiedAtSeconds: number) => void;
  readonly markRenewalFailed: (claim: string) => void;
  readonly remove: (claim: string) => void;
  readonly resetForLocalWipe: () => void;
}

function persist(proofs: Readonly<Record<string, StoredProof>>): void {
  try {
    getMmkv().set(KEY, JSON.stringify(proofs));
  } catch {
    // MMKV not ready (tests / pre-init): memory stays authoritative for this run.
  }
}

export const useZktlsProofs = create<ZktlsProofState>((set, get) => ({
  proofs: {},
  put: (proof, verifiedAtSeconds) => {
    const epoch = captureLocalDataEpoch();
    const claim = pageSocialClaim(proof.platform, proof.handle);
    const next = { ...get().proofs, [claim]: { proof, verifiedAt: verifiedAtSeconds * 1000 } };
    if (!canCommitLocalData(epoch)) return;
    set({ proofs: next });
    persist(next);
  },
  markRenewalFailed: (claim) => {
    const entry = get().proofs[claim];
    if (entry === undefined) return;
    const next = { ...get().proofs, [claim]: { ...entry, renewalFailedNotified: true } };
    set({ proofs: next });
    persist(next);
  },
  remove: (claim) => {
    const { [claim]: _dropped, ...rest } = get().proofs;
    set({ proofs: rest });
    persist(rest);
  },
  resetForLocalWipe: () => {
    set({ proofs: {} });
  },
}));

export function hydrateZktlsProofs(): void {
  try {
    const raw = getMmkv().getString(KEY);
    if (raw === undefined) return;
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object') {
      useZktlsProofs.setState({ proofs: parsed as Record<string, StoredProof> });
    }
  } catch {
    // Corrupt or unreadable: start empty rather than show a badge we can't back.
  }
}
