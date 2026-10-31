/**
 * The witnesses this phone published, kept in MMKV so a Page you already
 * witnessed doesn't offer 「幫他見證」 again on every open (each tap re-signs
 * with Face ID and the attested device key, then republishes). It only gates
 * the button: every count still comes from verified relay events.
 *
 * An entry stops counting once the witness would lapse for viewers
 * (`WITNESS_LAPSE_SECONDS`), so renewing an old witness is offered again.
 */
import { WITNESS_LAPSE_SECONDS } from '@solidarity/shared';

import { getMmkv } from '@/storage/mmkv';

const KEY = 'witness:mine:v1';

type Stored = Readonly<Record<string, number>>;

function entryKey(claim: string, subjectHex: string): string {
  return `${claim}|${subjectHex.toLowerCase()}`;
}

function read(): Stored {
  try {
    const raw = getMmkv().getString(KEY);
    if (raw === undefined) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
    );
  } catch {
    return {};
  }
}

/** When this phone last witnessed `claim` on that Page, if it still counts. */
export function myWitnessAt(claim: string, subjectHex: string, nowSeconds = Math.floor(Date.now() / 1000)): number | null {
  const at = read()[entryKey(claim, subjectHex)];
  return at !== undefined && nowSeconds - at <= WITNESS_LAPSE_SECONDS ? at : null;
}

export function rememberMyWitness(claim: string, subjectHex: string, observedAt: number): void {
  const now = Math.floor(Date.now() / 1000);
  // Drop lapsed entries while writing, so the record never grows unbounded.
  const kept = Object.entries(read()).filter(([, at]) => now - at <= WITNESS_LAPSE_SECONDS);
  try {
    getMmkv().set(KEY, JSON.stringify({ ...Object.fromEntries(kept), [entryKey(claim, subjectHex)]: observedAt }));
  } catch {
    // MMKV not ready: the relays still hold the witness; the button just reappears.
  }
}
