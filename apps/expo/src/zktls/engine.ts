/**
 * Proving the owner's own link (docs/ref/10 §3.11 tier 3, cold start): this
 * phone fetches the public profile itself, checks the owner field for
 * `creds.id/@name`, and signs a self-witness with the npub key and the
 * attested device key. No notary, no TLSNotary prover; the badge is a check
 * "made by the creds app on a real phone", which any viewer re-verifies
 * offline. Runs unattended for the 30-day renewal (no Face ID).
 */
import { err, ok, type Result, type SocialTarget } from '@solidarity/shared';

import type { NostrEvent } from '@/nostr/nostrAdapter';
import { getNostrPubkey, npubEncode } from '@/nostr/userKey';
import { createWitness, type WitnessFailure } from '@/witness/witness';

export type ProofFailure = WitnessFailure;

export async function currentNpub(): Promise<Result<string, ProofFailure>> {
  const pubkey = await getNostrPubkey();
  if (!pubkey.ok) return err('noNostrKey');
  const npub = npubEncode(pubkey.value);
  return npub.ok ? ok(npub.value) : err('noNostrKey');
}

/** Check `target` on this phone and return a signed self-witness that already verifies. */
export async function proveSocialTarget(target: SocialTarget, name: string): Promise<Result<NostrEvent, ProofFailure>> {
  const npub = await currentNpub();
  if (!npub.ok) return npub;
  return createWitness(target, name, npub.value);
}
