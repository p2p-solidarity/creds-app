import { sha256 } from '@noble/hashes/sha2.js';

/** NIP-01 unsigned event: the `[0, pubkey, created_at, kind, tags, content]` tuple an event id hashes. */
export interface Nip01UnsignedEvent {
  readonly pubkey: string;
  readonly created_at: number;
  readonly kind: number;
  readonly tags: readonly (readonly string[])[];
  readonly content: string;
}

export function computeNip01EventId(event: Nip01UnsignedEvent): string {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return hexEncode(sha256(new TextEncoder().encode(serialized)));
}

const HEX_TABLE: readonly string[] = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, '0')
);

export function hexEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += HEX_TABLE[bytes[i] ?? 0];
  return s;
}

export function hexDecode(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new RangeError(`hex must have even length (got ${String(hex.length)})`);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    if (!Number.isFinite(byte)) {
      throw new RangeError(`invalid hex at byte ${String(i)}: "${hex.substring(i * 2, i * 2 + 2)}"`);
    }
    out[i] = byte;
  }
  return out;
}
