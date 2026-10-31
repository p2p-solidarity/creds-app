/**
 * What re-signing the device-attested passport statement needs, kept on this
 * phone only (never the chip data). Separate from `npubBinding.ts` so the
 * credential store can forget it on delete without importing nostr.
 */
import { getMmkv } from '@/storage/mmkv';

const STORE_KEY = 'passport:statement:v1';

export interface StoredStatement {
  readonly npubHex: string;
  readonly ageOver18: boolean;
  readonly nullifier?: string;
  readonly readAt: number;
  readonly signedAt: number;
  /** Passport expiry (unix ms); renewals stop after it. Null when the MRZ had none. */
  readonly passportExpiresAt: number | null;
  /** The saved passport credential this statement is for. Absent on statements saved before P2. */
  readonly credentialId?: string;
}

// Bumped on every forget, so a renewal that started before the delete can see
// it lost the race and must not write the statement back.
let generation = 0;

export function statementGeneration(): number {
  return generation;
}

export function readStoredStatement(): StoredStatement | null {
  try {
    const raw = getMmkv().getString(STORE_KEY);
    return raw === undefined ? null : (JSON.parse(raw) as StoredStatement);
  } catch {
    return null;
  }
}

/** Writes unless a forget happened since `expectedGeneration`; false when skipped. */
export function writeStoredStatement(stored: StoredStatement, expectedGeneration: number): boolean {
  if (expectedGeneration !== generation) return false;
  try {
    getMmkv().set(STORE_KEY, JSON.stringify(stored));
  } catch {
    // Not persisted: the statement still went out; it lapses after 90 days without renewals.
  }
  return true;
}

/**
 * Stop re-signing: drop the stored statement. With a `credentialId`, only the
 * statement for that passport (or one saved before statements recorded their
 * credential) is dropped; without one, any statement is.
 */
export function forgetPassportStatement(credentialId?: string): void {
  const stored = readStoredStatement();
  if (stored === null) return;
  if (credentialId !== undefined && stored.credentialId !== undefined && stored.credentialId !== credentialId) return;
  generation += 1;
  try {
    getMmkv().remove(STORE_KEY);
  } catch {
    // MMKV not ready: nothing was readable either.
  }
}
