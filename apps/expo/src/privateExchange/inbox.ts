/**
 * Inbox sync (docs/ref/16 §3): fetch kind 1059 wraps p-tagged to me, open
 * them, tie each sender's npub to a DID, and route requests, answers and
 * shared contact details.
 *
 * Every rejection is dropped silently (no reply, no UI) and logged as a fixed
 * tag only — never an npub, DID or content. The cursor advances only after a
 * relay reached EOSE: a blind read must not skip messages.
 */
import {
  CREDS_DEVICE_TRUST,
  hexToNpub,
  pageBindsSender,
  parsePrivateMessage,
  verifyPassportPresentation,
  type ContactShareMessage,
  type ParsedPrivateMessage,
  type ProfileRecord,
  type ProofRequestMessage,
  type ProofResponseMessage,
} from '@solidarity/shared';

import { getRootDid } from '@/identity/rootKey';
import { resolveProfileByNpub } from '@/nostr/resolveProfile';
import { getNostrPubkey, unwrapForMe } from '@/nostr/userKey';
import { useProfileSnapshotStore } from '@/people/profileSnapshots';
import { verifyProfileJws } from '@/scan/verifiedPageHandler';
import { captureLocalDataEpoch, type LocalDataEpoch } from '@/settings/localDataWipeBarrier';

import { collectEvents, ensureOwnDmRelays } from './relays';
import { getPrivateExchangeSnapshot, usePrivateExchangeStore } from './store';

const MAX_OPEN_PER_SYNC = 200;
/** Per-relay REQ limit; a relay that returns this many may have cut older wraps. */
const FETCH_LIMIT = 500;
/** Seal and wrap times are pushed up to two days into the past (NIP-59). */
const WRAP_BACKDATE_SECONDS = 2 * 86_400 + 600;
const FIRST_SYNC_LOOKBACK_SECONDS = 9 * 86_400;

export type InboxSyncResult =
  | { readonly kind: 'synced'; readonly opened: number; readonly confirmed: boolean }
  | { readonly kind: 'noKey' };

interface BoundSender {
  readonly did: string;
  readonly record: ProfileRecord;
}

function drop(reason: string): void {
  console.warn(`[privateExchange] dropped: ${reason}`);
}

function savedPageFor(senderHex: string): ProfileRecord | null {
  for (const snapshot of useProfileSnapshotStore.getState().snapshots.values()) {
    if (snapshot.kind === 'verified' && pageBindsSender(snapshot.record, senderHex)) return snapshot.record;
  }
  return null;
}

/**
 * npub → DID: the embedded Page, else a saved Page, else the network (§3 step 5).
 * 'retry' = no relay answered; the wrap is opened again next sync.
 */
async function bindSender(parsed: ParsedPrivateMessage): Promise<BoundSender | 'unbound' | 'retry'> {
  const page = parsed.message.page;
  if (page !== undefined) {
    const verified = verifyProfileJws(page);
    if (verified.kind !== 'verified' || !pageBindsSender(verified.record, parsed.senderHex)) return 'unbound';
    return { did: verified.record.did, record: verified.record };
  }
  const saved = savedPageFor(parsed.senderHex);
  if (saved !== null) return { did: saved.did, record: saved };
  const npub = hexToNpub(parsed.senderHex);
  if (!npub.ok) return 'unbound';
  const resolved = await resolveProfileByNpub(npub.value);
  if (resolved.kind === 'verified') return { did: resolved.record.did, record: resolved.record };
  return resolved.reason === 'unreachable' ? 'retry' : 'unbound';
}

function onRequest(parsed: ParsedPrivateMessage, message: ProofRequestMessage, sender: BoundSender, epoch: LocalDataEpoch): void {
  usePrivateExchangeStore.getState().addIncoming(
    {
      id: parsed.rumorId,
      senderHex: parsed.senderHex,
      senderDid: sender.did,
      senderName: sender.record.displayName,
      claims: message.claims,
      purpose: message.purpose ?? null,
      nonce: message.nonce,
      exp: message.exp,
      receivedAt: Math.floor(Date.now() / 1000),
      status: 'pending',
    },
    epoch
  );
}

function onContactShare(parsed: ParsedPrivateMessage, message: ContactShareMessage, sender: BoundSender, epoch: LocalDataEpoch): void {
  usePrivateExchangeStore.getState().addContactShare(
    {
      id: parsed.rumorId,
      senderHex: parsed.senderHex,
      senderDid: sender.did,
      senderName: sender.record.displayName,
      ...(message.phone === undefined ? {} : { phone: message.phone }),
      ...(message.email === undefined ? {} : { email: message.email }),
      ...(message.note === undefined ? {} : { note: message.note }),
      // Author-stated; never later than now, so a fast clock can't block updates.
      sharedAt: Math.min(parsed.createdAt, Math.floor(Date.now() / 1000)),
    },
    epoch
  );
}

function onResponse(
  parsed: ParsedPrivateMessage,
  message: ProofResponseMessage,
  sender: BoundSender,
  myHex: string,
  epoch: LocalDataEpoch
): void {
  const request = parsed.replyTo === undefined ? undefined : getPrivateExchangeSnapshot().outgoing[parsed.replyTo];
  if (request === undefined) { drop('noMatchingRequest'); return; }
  if (request.answer !== null) { drop('alreadyAnswered'); return; }
  const now = Math.floor(Date.now() / 1000);
  if (request.recipientHex !== parsed.senderHex || request.recipientDid !== sender.did) { drop('wrongResponder'); return; }

  const verified = verifyPassportPresentation(
    message.passport,
    {
      senderHex: parsed.senderHex,
      myHex,
      nonce: request.nonce,
      requested: request.claims,
      requestSentAt: request.sentAt,
      requestExp: request.exp,
      nowSeconds: now,
    },
    CREDS_DEVICE_TRUST
  );
  if (!verified.ok) { drop(verified.error); return; }
  usePrivateExchangeStore.getState().answerOutgoing(
    request.id,
    { claims: verified.value.claims, tier: verified.value.tier, chip: verified.value.chip, verifiedAt: now },
    epoch
  );
}

let inFlight: Promise<InboxSyncResult> | null = null;

/** One sync at a time; concurrent callers share it. */
export function syncPrivateInbox(): Promise<InboxSyncResult> {
  inFlight ??= runSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(): Promise<InboxSyncResult> {
  const me = await getNostrPubkey();
  if (!me.ok) return { kind: 'noKey' };
  const epoch = captureLocalDataEpoch();
  const startedAt = Math.floor(Date.now() / 1000);
  const relays = await ensureOwnDmRelays();
  const state = getPrivateExchangeSnapshot();
  const since = state.cursor === null ? startedAt - FIRST_SYNC_LOOKBACK_SECONDS : state.cursor - WRAP_BACKDATE_SECONDS;

  const { events, confirmed } = await collectEvents(relays, { kinds: [1059], '#p': [me.value], since, limit: FETCH_LIMIT });
  const allUnseen = events.filter((e) => state.seen[e.id] === undefined);
  const unseen = allUnseen.slice(0, MAX_OPEN_PER_SYNC);
  const capped = unseen.length < allUnseen.length || events.length >= FETCH_LIMIT;
  const retry = new Set<string>();

  const opened = await unwrapForMe(unseen);
  if (!opened.ok) return { kind: 'noKey' };
  const rootDid = await getRootDid();

  for (const result of opened.value.opened) {
    if (!result.ok) {
      drop(result.error);
      continue;
    }
    const parsed = parsePrivateMessage(result.value, opened.value.myHex, Math.floor(Date.now() / 1000));
    if (!parsed.ok) {
      if (parsed.error !== 'notCreds') drop(parsed.error);
      continue;
    }
    const sender = await bindSender(parsed.value);
    if (sender === 'retry') {
      retry.add(result.value.wrapId);
      drop('senderUnresolved');
      continue;
    }
    if (sender === 'unbound') {
      drop('senderNotBound');
      continue;
    }
    if (rootDid.ok && sender.did === rootDid.value) {
      drop('fromMyself');
      continue;
    }
    const { message } = parsed.value;
    if (message.type === 'proof.request') onRequest(parsed.value, message, sender, epoch);
    else if (message.type === 'proof.response') onResponse(parsed.value, message, sender, opened.value.myHex, epoch);
    else onContactShare(parsed.value, message, sender, epoch);
  }

  usePrivateExchangeStore
    .getState()
    .markSeen(
      unseen.filter((e) => !retry.has(e.id)).map((e) => e.id),
      confirmed && !capped && retry.size === 0 ? startedAt : null,
      epoch
    );
  return { kind: 'synced', opened: unseen.length, confirmed };
}
