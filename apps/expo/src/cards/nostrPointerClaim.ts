/**
 * Nostr subscription pointer inside the SIGNED card claims — the card-wire
 * half of CREDS §3.3's 訂閱憑據 (05-spec §3, v1.1). Shape on the wire:
 *
 *   vc.credentialSubject.subscription.nostr = { npub, relays: string[] }
 *
 * Emit honesty rule: the pointer is attached ONLY when the sender's own
 * Nostr binding is currently `verified` in the badge-status cache — a card
 * never carries an unverified subscription credential. It rides exclusively
 * on the SIGNED wires (CRD1 / legacy didSigned JWT): an unsigned pointer
 * would let anyone who re-encodes an envelope redirect future updates, so
 * plaintext/zkProof envelopes deliberately never carry one.
 *
 * Receive trust rule (see people/cardSubscriptionBootstrap.ts): the claim
 * proves only "the card SIGNER attests this npub". Nothing binds the card
 * signing key to the page's root did today, so the
 * pointer bootstraps a SILENT refresh only for a did the user has already
 * saved; it never creates a new person. The v2 design (a long-lived
 * root-signed card-key attestation) is specced in 05 §3 before silent
 * subscribe-to-new-people can be safe.
 *
 * Relay hints are attacker-adjacent input on receive (they name hosts the
 * app will open websockets to): `sanitizeRelayHints` enforces wss://, a
 * parseable URL, a length cap, dedupe, and at most `MAX` entries — and the
 * resolver always keeps `DEFAULT_RELAYS` in the set so hints can widen but
 * never eclipse the default relays.
 */

export const NOSTR_POINTER_MAX_RELAYS = 3;
const MAX_RELAY_URL_LENGTH = 64;
const NPUB_RE = /^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/u;
const MAX_NPUB_LENGTH = 90;

export interface NostrPointerClaim {
  readonly npub: string;
  readonly relays: readonly string[];
}

/** Validate + cap relay hints from an untrusted claims payload. */
export function sanitizeRelayHints(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (out.length >= NOSTR_POINTER_MAX_RELAYS) break;
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_RELAY_URL_LENGTH) continue;
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      continue;
    }
    if (url.protocol !== 'wss:' || url.host.length === 0) continue;
    if (!out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

/**
 * Extract + validate the pointer from a card claims payload (the same
 * object for the legacy JWT and the CRD1 CBOR path — `cborToJson` has
 * already normalised the latter). Returns null for absent or malformed
 * pointers — a bad pointer never fails the card scan itself.
 */
export function parseNostrPointerClaim(
  claims: Readonly<Record<string, unknown>>
): NostrPointerClaim | null {
  const vc = pickRecord(claims['vc']);
  const subject = pickRecord(vc?.['credentialSubject']);
  const subscription = pickRecord(subject?.['subscription']);
  const nostr = pickRecord(subscription?.['nostr']);
  if (!nostr) return null;
  const npub = nostr['npub'];
  if (typeof npub !== 'string' || !NPUB_RE.test(npub) || npub.length > MAX_NPUB_LENGTH) {
    return null;
  }
  return { npub, relays: sanitizeRelayHints(nostr['relays']) };
}

function pickRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }
  return undefined;
}
