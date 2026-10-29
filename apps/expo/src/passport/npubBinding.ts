/**
 * Passport → npub binding (docs/ref/10 §3.11): a passport show proof whose
 * nonce is SHA-256 of the holder's npub, published as their NIP-78
 * `creds.passport.npub` record. It says "a valid passport stands behind this
 * npub" without revealing anything from the passport, and carries the global
 * passport nullifier so a viewer's app can count distinct passports behind a
 * Page's witnesses.
 *
 * One npub per passport: when two npubs publish the same nullifier, only the
 * newer binding counts (a new Page replaces the old one).
 *
 * The web does not verify passport ZK (light circuits, §3.11); this runs in
 * the app only. A fallback SD-JWT credential (`trustLevel: 'white'`) never
 * produces a binding — only a real `openac_show` proof does.
 */
import { err, ok, sha256Bytes, type Result } from '@solidarity/shared';

import { signOpenAcDeviceBindingDigest } from '@/keychain';
import type { NostrEvent } from '@/nostr/nostrAdapter';
import { publishToRelays, type PublishReport } from '@/nostr/publish';
import { publishEvent } from '@/nostr/nostrAdapter';
import { getNostrPubkey, signNostrEvent } from '@/nostr/userKey';
import { loadPassportNitroModules } from '@/passport/nitroModules';
import { PASSPORT_NULLIFIER_SCOPE } from '@/passport/openacV3';
import { arrayBufferToBase64 } from '@/passport/pipeline';
import { PASSPORT_SHOW_LINK_SCOPE } from '@/passport/showEnvelope';
import { parsePassportShowEnvelopeJson } from '@/passport/showPresentation';
import { generatePassportShowPresentation } from '@/passport/showPresentation';
import { passportScopeToFieldDecimal, verifyPassportShowPresentation } from '@/passport/showVerifier';
import {
  loadPassportShowVkSelfPin,
  loadPassportShowWitness,
  PASSPORT_SHOW_VK_BUILD_PIN_SHA256,
} from '@/passport/showWitnessVault';
import { fetchEvents } from '@/witness/witness';

export const PASSPORT_NPUB_D_TAG = 'creds.passport.npub';
const KIND = 30078;
/** A binding older than this no longer counts; the owner republishes monthly. */
const BINDING_MAX_AGE_MS = 90 * 86_400_000;

export function passportNpubNonceHash(npubHex: string): Uint8Array {
  return sha256Bytes(`creds.passport.npub:v1:${npubHex.toLowerCase()}`);
}

function utcToday(): { year: number; month: number; day: number } {
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };
}

export type BindingFailure = 'noNostrKey' | 'noWitness' | 'noProver' | 'proofFailed';

/** Prove this passport for this phone's npub (one Face ID for the device binding) and publish it. */
export async function publishPassportNpubBinding(
  credentialId: string,
  holderDid: string,
  relays: readonly string[],
): Promise<Result<PublishReport, BindingFailure>> {
  const npubHex = await getNostrPubkey();
  if (!npubHex.ok) return err('noNostrKey');
  const witnessBundleJson = await loadPassportShowWitness(credentialId);
  if (witnessBundleJson === null) return err('noWitness');
  const zk = loadPassportNitroModules().zk;
  if (zk === null) return err('noProver');

  let envelopeJson: string;
  try {
    ({ envelopeJson } = await generatePassportShowPresentation({
      witnessBundleJson,
      nonceHash: passportNpubNonceHash(npubHex.value),
      today: utcToday(),
      disclosure: { discloseAge: false, discloseNationality: false },
      freshness: 'challenge',
      holderDid,
      selectedClaims: [],
      signDeviceDigest: signOpenAcDeviceBindingDigest,
      prover: zk,
      encodeProofBytes: arrayBufferToBase64,
    }));
  } catch {
    return err('proofFailed');
  }
  const nullifier = parsePassportShowEnvelopeJson(envelopeJson)?.publicInputs.nullifier;
  if (nullifier === undefined || nullifier === '0') return err('proofFailed');
  // `n` lets anyone find every npub that claims this passport; the newest binding wins.
  const signed = await signNostrEvent({
    kind: KIND,
    tags: [
      ['d', PASSPORT_NPUB_D_TAG],
      ['n', nullifier],
    ],
    content: envelopeJson,
  });
  if (!signed.ok) return err('noNostrKey');
  return ok(await publishToRelays(signed.value, relays, publishEvent));
}

/** The passport nullifier `event` proves for its author, or null. */
export async function verifyPassportNpubBinding(event: NostrEvent, now: Date = new Date()): Promise<string | null> {
  const zk = loadPassportNitroModules().zk;
  if (zk === null) return null;
  const result = await verifyPassportShowPresentation({
    envelopeJson: event.content,
    verifyNoirProof: (proof, vk) => zk.verifyNoirProof(proof, vk),
    vkPins: { buildPin: PASSPORT_SHOW_VK_BUILD_PIN_SHA256, selfPin: loadPassportShowVkSelfPin() },
    expectedScope: PASSPORT_SHOW_LINK_SCOPE,
    freshness: { mode: 'challenge', expectedNonceHash: passportNpubNonceHash(event.pubkey) },
    now,
    maxAgeMs: BINDING_MAX_AGE_MS,
  });
  if (!result.ok) return null;
  const { nullifierScope, nullifier } = result.envelope.publicInputs;
  if (nullifierScope !== passportScopeToFieldDecimal(PASSPORT_NULLIFIER_SCOPE) || nullifier === '0') return null;
  return nullifier;
}

/** Newest verified binding per nullifier among `events` (author + time). */
async function newestOwners(events: readonly NostrEvent[]): Promise<Map<string, { pubkey: string; at: number }>> {
  const newestPerAuthor = new Map<string, NostrEvent>();
  for (const e of events) {
    const prev = newestPerAuthor.get(e.pubkey);
    if (prev === undefined || e.created_at > prev.created_at) newestPerAuthor.set(e.pubkey, e);
  }
  const owners = new Map<string, { pubkey: string; at: number }>();
  for (const e of newestPerAuthor.values()) {
    const nullifier = await verifyPassportNpubBinding(e);
    if (nullifier === null) continue;
    const prev = owners.get(nullifier);
    if (prev === undefined || e.created_at > prev.at) owners.set(nullifier, { pubkey: e.pubkey, at: e.created_at });
  }
  return owners;
}

/**
 * How many distinct passports stand behind `npubHexes` (witness authors).
 * A passport counts only for the npub that bound it most recently anywhere:
 * an npub whose passport has since been bound to a newer npub is not a
 * passport witness any more (one npub per passport).
 */
export async function countPassportHolders(npubHexes: readonly string[], relays: readonly string[]): Promise<number> {
  if (npubHexes.length === 0) return 0;
  const mine = await newestOwners(
    await fetchEvents(relays, { kinds: [KIND], authors: [...npubHexes], '#d': [PASSPORT_NPUB_D_TAG] }),
  );
  if (mine.size === 0) return 0;
  const everywhere = await newestOwners(
    await fetchEvents(relays, { kinds: [KIND], '#d': [PASSPORT_NPUB_D_TAG], '#n': [...mine.keys()] }),
  );
  const witnesses = new Set(npubHexes);
  let count = 0;
  for (const [nullifier, owner] of mine) {
    const newest = everywhere.get(nullifier) ?? owner;
    if (witnesses.has(newest.pubkey)) count += 1;
  }
  return count;
}
