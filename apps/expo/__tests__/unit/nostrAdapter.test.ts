import { describe, expect, test } from 'bun:test';
import { schnorr } from '@noble/curves/secp256k1.js';

import { computeNip01EventId, hexDecode, hexEncode } from '@/nostr/nip01';
import { subscribeEvents, type NostrEvent, verifyNostrEvent } from '@/nostr/nostrAdapter';

function makeKeypair(seed: number): { privkey: Uint8Array; pubkeyHex: string } {
  const privkey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) privkey[i] = (seed + i) & 0xff;
  return { privkey, pubkeyHex: hexEncode(schnorr.getPublicKey(privkey)) };
}

function signedEvent(
  privkey: Uint8Array,
  pubkeyHex: string,
  tags: readonly (readonly string[])[],
  createdAt: number
): NostrEvent {
  const kind = 30078;
  const content = '{"v":1}';
  const id = computeNip01EventId({ pubkey: pubkeyHex, created_at: createdAt, kind, tags, content });
  const sig = hexEncode(schnorr.sign(hexDecode(id), privkey));
  return { id, pubkey: pubkeyHex, created_at: createdAt, kind, tags, content, sig };
}

describe('nostrAdapter.verifyNostrEvent — basic invariants', () => {
  test('rejects bad sig length / malformed hex without throwing', () => {
    const { privkey, pubkeyHex } = makeKeypair(0x88);
    const ev = signedEvent(privkey, pubkeyHex, [], 1_700_200_000);
    expect(verifyNostrEvent({ ...ev, sig: ev.sig.slice(0, -2) })).toBe(false);
    expect(verifyNostrEvent({ ...ev, sig: 'garbage' })).toBe(false);
    expect(verifyNostrEvent({ ...ev, sig: 'zz' })).toBe(false);
    expect(verifyNostrEvent({ ...ev, id: 'zz' })).toBe(false);
    expect(verifyNostrEvent({ ...ev, pubkey: 'zz' })).toBe(false);
  });

  test('rejects an event whose pubkey was swapped after signing', () => {
    const signer = makeKeypair(0x88);
    const other = makeKeypair(0x99);
    const ev = signedEvent(signer.privkey, signer.pubkeyHex, [], 1_700_200_000);

    expect(verifyNostrEvent({ ...ev, pubkey: other.pubkeyHex })).toBe(false);
  });

  test('flipping a tag changes the computed id, fails verify', () => {
    const { privkey, pubkeyHex } = makeKeypair(0x88);
    const ev = signedEvent(privkey, pubkeyHex, [['e', 'a'.repeat(64)]], 1_700_200_000);
    const tampered = { ...ev, tags: [...ev.tags, ['x', 'extra']] };
    expect(verifyNostrEvent(tampered)).toBe(false);
  });
});

class FakeRelayWebSocket {
  static latest: FakeRelayWebSocket | null = null;

  onopen: (() => void) | null = null;
  onmessage: ((event: { readonly data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { readonly code: number }) => void) | null = null;
  readonly sent: string[] = [];

  constructor(_url: string) {
    FakeRelayWebSocket.latest = this;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    // no-op test transport
  }

  emitMessage(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

describe('nostrAdapter.subscribeEvents — relay trust boundary', () => {
  test('surfaces valid signed events and silently drops forged events', () => {
    const originalWebSocket = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: FakeRelayWebSocket,
    });

    try {
      const signer = makeKeypair(0x33);
      const other = makeKeypair(0x44);
      const valid = signedEvent(signer.privkey, signer.pubkeyHex, [], 1_700_300_000);
      const received: NostrEvent[] = [];
      const errors: string[] = [];
      let eoseCount = 0;
      const handle = subscribeEvents(
        'wss://relay.invalid',
        { kinds: [valid.kind], authors: [valid.pubkey] },
        (event) => received.push(event),
        () => {
          eoseCount += 1;
        },
        (message) => errors.push(message)
      );
      const socket = FakeRelayWebSocket.latest;
      expect(socket).not.toBeNull();
      if (!socket) return;

      socket.emitMessage(['EVENT', handle.subscriptionId, { ...valid, content: `${valid.content}tampered` }]);
      socket.emitMessage(['EVENT', handle.subscriptionId, { ...valid, pubkey: other.pubkeyHex }]);
      socket.emitMessage(['EVENT', handle.subscriptionId, { ...valid, sig: valid.sig.slice(0, -2) }]);
      socket.emitMessage(['EVENT', handle.subscriptionId, { ...valid, sig: 'garbage' }]);
      expect(received).toEqual([]);
      expect(errors).toEqual([]);

      socket.emitMessage(['EOSE', handle.subscriptionId]);
      expect(eoseCount).toBe(1);

      socket.emitMessage(['EVENT', handle.subscriptionId, valid]);
      expect(received).toEqual([valid]);

      handle.close();
    } finally {
      if (originalWebSocket) {
        Object.defineProperty(globalThis, 'WebSocket', originalWebSocket);
      } else {
        Reflect.deleteProperty(globalThis, 'WebSocket');
      }
      FakeRelayWebSocket.latest = null;
    }
  });
});
