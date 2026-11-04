/**
 * Minimal raw-WebSocket Nostr publish/subscribe client. The protocol is
 * "WebSocket + four JSON message shapes", so a full client library is not
 * worth the dependency.
 */
import { schnorr } from '@noble/curves/secp256k1.js';

import { computeNip01EventId, hexDecode } from './nip01';

export interface NostrEvent {
  readonly id: string;
  readonly pubkey: string;
  readonly created_at: number;
  readonly kind: number;
  readonly tags: readonly (readonly string[])[];
  readonly content: string;
  readonly sig: string;
}

export interface PublishResult {
  readonly accepted: boolean;
  readonly message: string;
  readonly elapsedMs: number;
  /**
   * Absent when the relay answered with an OK frame (accepted or refused —
   * a policy verdict either way). Set when we never got a verdict:
   * `'transport'` = fast connection-level failure (WS error, closed before
   * OK, send failed) — worth an immediate retry; `'timeout'` = the full wait
   * elapsed — the relay is likely down, retrying just doubles the stall.
   */
  readonly failure?: 'timeout' | 'transport';
}

/**
 * Open WS → send EVENT → wait for OK → close. The relay's `["OK", id,
 * accepted, msg]` response is the canonical handshake.
 *
 * Caller MUST validate the URL — we don't sanity-check protocol scheme
 * (some private relays use ws:// over LAN). Timeouts default 8s.
 */
export async function publishEvent(
  relayUrl: string,
  event: NostrEvent,
  timeoutMs = 8000
): Promise<PublishResult> {
  const started = performance.now();
  return new Promise<PublishResult>((resolve) => {
    let settled = false;
    const ws = new WebSocket(relayUrl);
    const finish = (result: PublishResult): void => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* already closed */ }
      resolve(result);
    };
    const timer = setTimeout(() => {
      finish({ accepted: false, message: `timeout after ${String(timeoutMs)}ms`, elapsedMs: performance.now() - started, failure: 'timeout' });
    }, timeoutMs);
    ws.onopen = () => {
      try {
        ws.send(JSON.stringify(['EVENT', event]));
      } catch (err) {
        clearTimeout(timer);
        finish({ accepted: false, message: err instanceof Error ? err.message : 'send failed', elapsedMs: performance.now() - started, failure: 'transport' });
      }
    };
    ws.onmessage = (ev) => {
      try {
        const data = typeof ev.data === 'string' ? ev.data : '';
        const msg = JSON.parse(data) as readonly unknown[];
        if (Array.isArray(msg) && msg[0] === 'OK' && msg[1] === event.id) {
          clearTimeout(timer);
          finish({
            accepted: msg[2] === true,
            message: typeof msg[3] === 'string' ? msg[3] : '',
            elapsedMs: performance.now() - started,
          });
        }
      } catch {
        // Non-JSON frame from the relay (rare) — ignore and wait for OK.
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      finish({ accepted: false, message: 'websocket error', elapsedMs: performance.now() - started, failure: 'transport' });
    };
    ws.onclose = (ev) => {
      // If we never got OK before close, surface that.
      const code = typeof ev.code === 'number' ? ev.code : 0;
      if (!settled) {
        clearTimeout(timer);
        finish({ accepted: false, message: `closed (code ${String(code)})`, elapsedMs: performance.now() - started, failure: 'transport' });
      }
    };
  });
}

export interface NostrFilter {
  readonly kinds?: readonly number[];
  readonly authors?: readonly string[];
  readonly '#d'?: readonly string[];
  readonly '#e'?: readonly string[];
  readonly '#n'?: readonly string[];
  readonly since?: number;
  readonly limit?: number;
}

export interface SubscriptionHandle {
  readonly close: () => void;
  readonly subscriptionId: string;
}

/**
 * Does this event actually answer the REQ we sent?
 *
 * A relay is untrusted input: a valid signature proves an event was signed by
 * the key it names, not that it is the record we asked for — so
 * `subscribeEvents` drops anything that fails this, for every caller.
 * Without the tag check a relay can answer a `#d=solidarity.profile` request with the SAME
 * author's newer kind-30078 event from a different parameterized slot, and it
 * would be taken as the profile pointer — signature validity does not rule out
 * substitution across an author's own records.
 */
export function eventMatchesFilter(event: NostrEvent, filter: NostrFilter): boolean {
  if (filter.kinds !== undefined && !filter.kinds.includes(event.kind)) return false;
  if (filter.authors !== undefined && !filter.authors.includes(event.pubkey)) return false;
  if (filter.since !== undefined && event.created_at < filter.since) return false;
  for (const [key, wanted] of Object.entries(filter)) {
    if (!key.startsWith('#') || !Array.isArray(wanted)) continue;
    const tagName = key.slice(1);
    const present = event.tags.some(
      (tag) => tag[0] === tagName && tag[1] !== undefined && wanted.includes(tag[1])
    );
    if (!present) return false;
  }
  return true;
}

/**
 * Subscribe to a relay with a single filter. The relay streams matching
 * events via EVENT frames and signals end-of-stored-events with EOSE.
 * onEvent fires for each received event; onEose for the EOSE.
 *
 * Note: this leaves the connection open after EOSE so live events keep
 * arriving. Caller must `close()` when done — typically on screen unmount.
 */
export function subscribeEvents(
  relayUrl: string,
  filter: NostrFilter,
  onEvent: (event: NostrEvent) => void,
  onEose?: () => void,
  onError?: (message: string) => void
): SubscriptionHandle {
  const subscriptionId = `sb-${Math.random().toString(36).slice(2, 12)}`;
  let closed = false;
  const ws = new WebSocket(relayUrl);
  ws.onopen = () => {
    if (closed) return;
    try {
      ws.send(JSON.stringify(['REQ', subscriptionId, filter]));
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'send REQ failed');
    }
  };
  ws.onmessage = (ev) => {
    try {
      const data = typeof ev.data === 'string' ? ev.data : '';
      const msg = JSON.parse(data) as readonly unknown[];
      if (!Array.isArray(msg)) return;
      if (msg[0] === 'EVENT' && msg[1] === subscriptionId &&
          typeof msg[2] === 'object' && msg[2] !== null) {
        const candidate = msg[2] as Partial<NostrEvent>;
        if (
          typeof candidate.id === 'string' &&
          typeof candidate.pubkey === 'string' &&
          typeof candidate.created_at === 'number' &&
          typeof candidate.kind === 'number' &&
          typeof candidate.content === 'string' &&
          typeof candidate.sig === 'string' &&
          Array.isArray(candidate.tags) &&
          verifyNostrEvent(candidate as NostrEvent) &&
          eventMatchesFilter(candidate as NostrEvent, filter)
        ) {
          onEvent(candidate as NostrEvent);
        }
      } else if (msg[0] === 'EOSE' && msg[1] === subscriptionId) {
        onEose?.();
      } else if (msg[0] === 'NOTICE' && typeof msg[1] === 'string') {
        onError?.(`notice: ${msg[1]}`);
      }
    } catch {
      // Drop malformed frames.
    }
  };
  ws.onerror = () => { onError?.('websocket error'); };
  ws.onclose = (ev) => {
    if (!closed) {
      const code = typeof ev.code === 'number' ? ev.code : 0;
      onError?.(`closed (code ${String(code)})`);
    }
  };
  return {
    subscriptionId,
    close: () => {
      if (closed) return;
      closed = true;
      try { ws.send(JSON.stringify(['CLOSE', subscriptionId])); } catch { /* may be already closed */ }
      try { ws.close(); } catch { /* may be already closed */ }
    },
  };
}

/** Verify a received Nostr event's id + signature (BIP-340 schnorr over NIP-01 serialization). */
export function verifyNostrEvent(event: NostrEvent): boolean {
  try {
    const id = computeNip01EventId(event);
    if (id !== event.id) return false;
    return schnorr.verify(hexDecode(event.sig), hexDecode(event.id), hexDecode(event.pubkey));
  } catch {
    return false;
  }
}
