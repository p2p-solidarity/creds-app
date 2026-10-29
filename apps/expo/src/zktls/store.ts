/**
 * The owner's own link checks (docs/ref/10 §3.11, cold start). One entry
 * per Page claim (`x:@alice`): the self-witness event this phone signed,
 * which verified when it was stored. Public data (published to Nostr), so
 * MMKV plaintext is fine.
 *
 * Age drives the badge: < 30 days green; 30–90 days still green while the
 * background renewal retries; > 90 days the check lapses.
 *
 * Persisted at MMKV `witness:self:v1` (the notary-era `zktls:proofs:v1`
 * entries are dropped — their evidence no longer counts); hydrated once from
 * the root layout (Rule 10).
 */
import { create } from 'zustand';

import type { NostrEvent } from '@/nostr/nostrAdapter';
import { canCommitLocalData, captureLocalDataEpoch } from '@/settings/localDataWipeBarrier';
import { getMmkv } from '@/storage/mmkv';

const KEY = 'witness:self:v1';
const LEGACY_KEY = 'zktls:proofs:v1';

export const RENEW_AFTER_MS = 30 * 86_400_000;
export const LAPSE_AFTER_MS = 90 * 86_400_000;

export interface StoredProof {
  readonly event: NostrEvent;
  /** Epoch ms this phone checked the page. */
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
  readonly put: (claim: string, event: NostrEvent, verifiedAtSeconds: number) => void;
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
  put: (claim, event, verifiedAtSeconds) => {
    const epoch = captureLocalDataEpoch();
    const next = { ...get().proofs, [claim]: { event, verifiedAt: verifiedAtSeconds * 1000 } };
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
    const mmkv = getMmkv();
    mmkv.remove(LEGACY_KEY);
    const raw = mmkv.getString(KEY);
    if (raw === undefined) return;
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object') {
      useZktlsProofs.setState({ proofs: parsed as Record<string, StoredProof> });
    }
  } catch {
    // Corrupt or unreadable: start empty rather than show a badge we can't back.
  }
}
