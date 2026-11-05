/**
 * What a private passport presentation can disclose (docs/ref/16 §11.4), kept
 * on this phone only — read from the chip at scan time, never published. One
 * record, for the current passport; forgotten with it.
 */
import type { PassportChipState } from '@solidarity/shared';

import { getMmkv } from '@/storage/mmkv';

import {
  derivePassportName,
  derivePassportPublicSignals,
  type PassportChipSnapshot,
  type PassportMRZDraft,
} from './pipeline';

const STORE_KEY = 'passport:private:v1';

export interface PassportPrivateClaims {
  readonly credentialId: string;
  /** From DG1; absent when the chip gave none (the simulated chip). */
  readonly name?: string;
  readonly nationality?: string;
  readonly chip: PassportChipState;
  /** When the chip was read (unix s). */
  readonly readAt: number;
}

export function readPassportPrivateClaims(): PassportPrivateClaims | null {
  try {
    const raw = getMmkv().getString(STORE_KEY);
    return raw === undefined ? null : (JSON.parse(raw) as PassportPrivateClaims);
  } catch {
    return null;
  }
}

export function writePassportPrivateClaims(claims: PassportPrivateClaims): void {
  try {
    getMmkv().set(STORE_KEY, JSON.stringify(claims));
  } catch {
    // Not persisted: private presentation stays unavailable until a rescan.
  }
}

/** With a `credentialId`, only that passport's record is dropped. */
export function forgetPassportPrivateClaims(credentialId?: string): void {
  const stored = readPassportPrivateClaims();
  if (stored === null) return;
  if (credentialId !== undefined && stored.credentialId !== credentialId) return;
  try {
    getMmkv().remove(STORE_KEY);
  } catch {
    // MMKV not ready: nothing was readable either.
  }
}

/** At passport save: what the chip says, for later private presentation. */
export function recordPassportPrivateClaims(args: {
  readonly credentialId: string;
  readonly chip: PassportChipSnapshot;
  readonly draft: PassportMRZDraft;
  readonly chipVerified: boolean;
  readonly now: Date;
}): void {
  const { chip } = args;
  const signals = derivePassportPublicSignals({
    dg1MRZData: chip.dg1MRZData,
    fallbackNationality: args.draft.nationalityCode,
    currentDateYyMmDd: args.now.toISOString().slice(2, 10).replaceAll('-', ''),
  });
  const name = derivePassportName(chip.dg1MRZData);
  writePassportPrivateClaims({
    credentialId: args.credentialId,
    ...(name === null ? {} : { name }),
    ...(/^[A-Z]{3}$/u.test(signals.nationality) ? { nationality: signals.nationality } : {}),
    chip: args.chipVerified ? 'passiveAuth' : chip.isSimulated ? 'simulated' : 'unverified',
    readAt: Math.floor(chip.readAt.getTime() / 1000),
  });
}
