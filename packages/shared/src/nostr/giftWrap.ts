/**
 * NIP-59 gift wrap as NIP-17 uses it (docs/ref/16 §2.1):
 *
 *   rumor (unsigned, real author + real time)
 *     → seal  kind 13, signed by the author, tags [], content = NIP-44(author → recipient, rumor)
 *     → wrap  kind 1059, signed by a one-time key, [["p", recipient]], content = NIP-44(one-time → recipient, seal)
 *
 * Relays see only the wrap: the recipient and a time pushed up to two days into
 * the past. The author is inside the seal, readable by the recipient alone.
 *
 * Pure: scalars are passed in by the caller and never kept. `unwrapGiftWrap`
 * never throws; every rejection is a fixed tag that carries no message content.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';

import { nip44ConversationKey, nip44Decrypt, nip44Encrypt } from '../crypto/nip44';
import { hexToBytes } from '../crypto/hex';
import { err, ok, type Result } from '../types/result';

import {
  computeNip01EventId,
  isNostrEvent,
  nostrPublicKeyHex,
  signNostrEventWithScalar,
  verifyNostrEvent,
  type NostrEvent,
} from './event';

export const KIND_SEAL = 13;
export const KIND_GIFT_WRAP = 1059;

const TWO_DAYS_SECONDS = 2 * 86_400;
const FUTURE_SKEW_SECONDS = 300;
/** base64 of the largest NIP-44 payload (65 603 bytes) is 87 472 chars. */
const MAX_WRAP_CONTENT_CHARS = 90_000;

/** An unsigned event with its id (NIP-59 "rumor"). */
export interface Rumor {
  readonly id: string;
  readonly pubkey: string;
  readonly created_at: number;
  readonly kind: number;
  readonly tags: readonly (readonly string[])[];
  readonly content: string;
}

export interface RumorInput {
  readonly kind: number;
  readonly tags: readonly (readonly string[])[];
  readonly content: string;
  readonly created_at: number;
}

export type UnwrapFailure =
  | 'notGiftWrap'
  | 'badWrapSignature'
  | 'notForMe'
  | 'tooLarge'
  | 'wrapDecryptFailed'
  | 'malformedSeal'
  | 'badSealSignature'
  | 'sealHasTags'
  | 'sealDecryptFailed'
  | 'malformedRumor'
  | 'rumorIdMismatch'
  | 'senderMismatch'
  | 'rumorFromFuture';

export interface UnwrappedMessage {
  readonly rumor: Rumor;
  /** The seal signer — the authenticated author. Equals `rumor.pubkey`. */
  readonly senderHex: string;
  /** The wrap id, for de-duplication. */
  readonly wrapId: string;
}

export function createRumor(input: RumorInput, authorHex: string): Rumor {
  const unsigned = {
    pubkey: authorHex.toLowerCase(),
    created_at: input.created_at,
    kind: input.kind,
    tags: input.tags,
    content: input.content,
  };
  return { id: computeNip01EventId(unsigned), ...unsigned };
}

export interface WrapOptions {
  readonly nowSeconds?: number;
  /** Injectable for tests; returns a value in [0, 1). */
  readonly random?: () => number;
}

function pastTimestamp(now: number, random: () => number): number {
  return now - Math.floor(random() * TWO_DAYS_SECONDS);
}

/**
 * Seal `rumor` with the author's scalar and wrap it to `recipientHex`. The
 * rumor's pubkey must be the author's (it is what the recipient checks).
 */
export function wrapRumor(
  rumor: Rumor,
  authorScalar: Uint8Array,
  recipientHex: string,
  options: WrapOptions = {}
): Result<NostrEvent, string> {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const random = options.random ?? Math.random;
  let recipient: Uint8Array;
  try {
    if (nostrPublicKeyHex(authorScalar) !== rumor.pubkey) return err('giftWrap: rumor is not by this key');
    recipient = hexToBytes(recipientHex);
  } catch {
    return err('giftWrap: invalid key');
  }

  let sealContent: string;
  try {
    sealContent = nip44Encrypt(nip44ConversationKey(authorScalar, recipient), JSON.stringify(rumor));
  } catch {
    return err('giftWrap: cannot encrypt to recipient');
  }
  const seal = signNostrEventWithScalar(
    { kind: KIND_SEAL, tags: [], content: sealContent, created_at: pastTimestamp(now, random) },
    authorScalar
  );
  if (!seal.ok) return seal;

  const oneTime = secp256k1.utils.randomSecretKey();
  try {
    const wrapContent = nip44Encrypt(nip44ConversationKey(oneTime, recipient), JSON.stringify(seal.value));
    return signNostrEventWithScalar(
      {
        kind: KIND_GIFT_WRAP,
        tags: [['p', recipientHex.toLowerCase()]],
        content: wrapContent,
        created_at: pastTimestamp(now, random),
      },
      oneTime
    );
  } catch {
    return err('giftWrap: cannot encrypt to recipient');
  } finally {
    oneTime.fill(0);
  }
}

function decryptFrom(myScalar: Uint8Array, theirHex: string, payload: string): string | null {
  try {
    return nip44Decrypt(nip44ConversationKey(myScalar, hexToBytes(theirHex)), payload);
  } catch {
    return null;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isRumor(value: unknown): value is Rumor {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Partial<Rumor>;
  return (
    typeof r.id === 'string' &&
    typeof r.pubkey === 'string' &&
    typeof r.created_at === 'number' &&
    Number.isSafeInteger(r.created_at) &&
    typeof r.kind === 'number' &&
    Number.isSafeInteger(r.kind) &&
    Array.isArray(r.tags) &&
    r.tags.every((tag) => Array.isArray(tag) && tag.every((part) => typeof part === 'string')) &&
    typeof r.content === 'string'
  );
}

/**
 * Open a gift wrap addressed to the holder of `myScalar`. Checks, in order:
 * wrap shape/signature/recipient/size → seal shape/signature/empty tags →
 * rumor shape/id → rumor author = seal signer (NIP-17 MUST) → not in the future.
 */
export function unwrapGiftWrap(
  wrap: unknown,
  myScalar: Uint8Array,
  options: { readonly nowSeconds?: number } = {}
): Result<UnwrappedMessage, UnwrapFailure> {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!isNostrEvent(wrap) || wrap.kind !== KIND_GIFT_WRAP) return err('notGiftWrap');
  if (!verifyNostrEvent(wrap)) return err('badWrapSignature');

  let myHex: string;
  try {
    myHex = nostrPublicKeyHex(myScalar);
  } catch {
    return err('notForMe');
  }
  const recipients = wrap.tags.filter((t) => t[0] === 'p').map((t) => t[1]?.toLowerCase());
  if (!recipients.includes(myHex)) return err('notForMe');
  if (wrap.content.length > MAX_WRAP_CONTENT_CHARS) return err('tooLarge');

  const sealText = decryptFrom(myScalar, wrap.pubkey, wrap.content);
  if (sealText === null) return err('wrapDecryptFailed');
  const seal = parseJson(sealText);
  if (!isNostrEvent(seal) || seal.kind !== KIND_SEAL) return err('malformedSeal');
  if (!verifyNostrEvent(seal)) return err('badSealSignature');
  if (seal.tags.length > 0) return err('sealHasTags');

  const rumor = openSeal(seal, myScalar, now);
  if (!rumor.ok) return rumor;
  return ok({ rumor: rumor.value, senderHex: seal.pubkey.toLowerCase(), wrapId: wrap.id });
}

function openSeal(seal: NostrEvent, myScalar: Uint8Array, now: number): Result<Rumor, UnwrapFailure> {
  const rumorText = decryptFrom(myScalar, seal.pubkey, seal.content);
  if (rumorText === null) return err('sealDecryptFailed');
  const parsed = parseJson(rumorText);
  if (!isRumor(parsed)) return err('malformedRumor');
  const rumor: Rumor = {
    id: parsed.id,
    pubkey: parsed.pubkey,
    created_at: parsed.created_at,
    kind: parsed.kind,
    tags: parsed.tags,
    content: parsed.content,
  };
  if (computeNip01EventId(rumor) !== rumor.id) return err('rumorIdMismatch');
  if (rumor.pubkey.toLowerCase() !== seal.pubkey.toLowerCase()) return err('senderMismatch');
  if (rumor.created_at > now + FUTURE_SKEW_SECONDS) return err('rumorFromFuture');
  return ok(rumor);
}
