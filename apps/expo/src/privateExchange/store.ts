/**
 * Private exchange state (docs/ref/16): passport requests I sent and their
 * verified answers, requests others sent me, contact details people shared
 * with me privately, which gift wraps were already opened, and the inbox
 * cursor. MMKV-backed, this phone only.
 *
 * Seeds empty in memory and hydrates on first use (Rule 10). Every write
 * re-checks the local-data epoch, so a wipe in progress is never undone.
 */
import type { PassportChipState, PassportClaimValues, PassportRequestClaim } from '@solidarity/shared';
import { create } from 'zustand';

import { getProfileSnapshot } from '@/people/profileSnapshots';
import { canCommitLocalData, type LocalDataEpoch } from '@/settings/localDataWipeBarrier';
import { getMmkv } from '@/storage/mmkv';

const STORE_KEY = 'privateExchange:v1';
const MAX_INCOMING = 200;
const MAX_INCOMING_PER_SENDER = 20;
const SEEN_RETENTION_SECONDS = 30 * 86_400;
const MAX_CONTACT_SHARES = 200;

export interface VerifiedPassportAnswer {
  readonly claims: PassportClaimValues;
  readonly tier: 'L3' | 'L1';
  readonly chip: PassportChipState;
  /** Unix s, when this phone verified it. */
  readonly verifiedAt: number;
}

export interface OutgoingPassportRequest {
  /** The request rumor id — what the answer's `e` tag names. */
  readonly id: string;
  readonly recipientDid: string;
  readonly recipientHex: string;
  readonly claims: readonly PassportRequestClaim[];
  readonly nonce: string;
  readonly exp: number;
  readonly sentAt: number;
  readonly answer: VerifiedPassportAnswer | null;
}

export interface IncomingPassportRequest {
  readonly id: string;
  readonly senderHex: string;
  readonly senderDid: string;
  /** From the sender's verified Page; self-chosen, shown with the short DID. */
  readonly senderName: string;
  readonly claims: readonly PassportRequestClaim[];
  readonly purpose: string | null;
  readonly nonce: string;
  readonly exp: number;
  readonly receivedAt: number;
  readonly status: 'pending' | 'answered' | 'dismissed';
}

/** The newest contact details one person shared with me (one per sender DID). */
export interface ReceivedContactShare {
  /** The rumor id. */
  readonly id: string;
  readonly senderHex: string;
  readonly senderDid: string;
  /** From the sender's verified Page; self-chosen, shown with the short DID. */
  readonly senderName: string;
  readonly phone?: string;
  readonly email?: string;
  readonly note?: string;
  /** Unix s, the rumor's own time (author-stated): newer replaces older. */
  readonly sharedAt: number;
}

export interface ContactShareDraft {
  readonly phone: string;
  readonly email: string;
  readonly note: string;
}

interface Persisted {
  readonly outgoing: Readonly<Record<string, OutgoingPassportRequest>>;
  readonly incoming: Readonly<Record<string, IncomingPassportRequest>>;
  /** sender DID → their latest share. */
  readonly contacts: Readonly<Record<string, ReceivedContactShare>>;
  /** Phone and email I last shared, prefilled next time (a note is per person, never prefilled). */
  readonly contactDraft: ContactShareDraft | null;
  /** recipient DID → unix s I last shared my details with them. */
  readonly contactsSent: Readonly<Record<string, number>>;
  /** wrap id → unix s first seen. */
  readonly seen: Readonly<Record<string, number>>;
  /** Unix s of the last sync that reached at least one relay's EOSE. */
  readonly cursor: number | null;
}

const EMPTY: Persisted = {
  outgoing: {},
  incoming: {},
  contacts: {},
  contactDraft: null,
  contactsSent: {},
  seen: {},
  cursor: null,
};

interface PrivateExchangeState extends Persisted {
  readonly hydrated: boolean;
  readonly hydrate: () => void;
  readonly addOutgoing: (request: OutgoingPassportRequest, epoch: LocalDataEpoch) => boolean;
  readonly answerOutgoing: (id: string, answer: VerifiedPassportAnswer, epoch: LocalDataEpoch) => boolean;
  readonly addIncoming: (request: IncomingPassportRequest, epoch: LocalDataEpoch) => boolean;
  readonly setIncomingStatus: (id: string, status: IncomingPassportRequest['status'], epoch: LocalDataEpoch) => boolean;
  /** Keeps only the newest share per sender. */
  readonly addContactShare: (share: ReceivedContactShare, epoch: LocalDataEpoch) => boolean;
  readonly removeContactShare: (senderDid: string, epoch: LocalDataEpoch) => boolean;
  readonly recordContactSent: (recipientDid: string, draft: ContactShareDraft, at: number, epoch: LocalDataEpoch) => boolean;
  readonly markSeen: (wrapIds: readonly string[], cursor: number | null, epoch: LocalDataEpoch) => boolean;
  readonly resetForLocalWipe: () => void;
}

function readPersisted(): Persisted {
  try {
    const raw = getMmkv().getString(STORE_KEY);
    if (raw === undefined) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      outgoing: parsed.outgoing ?? {},
      incoming: parsed.incoming ?? {},
      contacts: parsed.contacts ?? {},
      contactDraft: parsed.contactDraft ?? null,
      contactsSent: parsed.contactsSent ?? {},
      seen: parsed.seen ?? {},
      cursor: typeof parsed.cursor === 'number' ? parsed.cursor : null,
    };
  } catch {
    return EMPTY;
  }
}

function pick(state: Persisted): Persisted {
  return {
    outgoing: state.outgoing,
    incoming: state.incoming,
    contacts: state.contacts,
    contactDraft: state.contactDraft,
    contactsSent: state.contactsSent,
    seen: state.seen,
    cursor: state.cursor,
  };
}

/** Over the cap, shares from people not in my People go first, oldest first. */
function capContacts(contacts: Record<string, ReceivedContactShare>): Record<string, ReceivedContactShare> {
  const saved = (c: ReceivedContactShare): number => (getProfileSnapshot(c.senderDid) === undefined ? 0 : 1);
  const kept = Object.values(contacts)
    .sort((a, b) => saved(b) - saved(a) || b.sharedAt - a.sharedAt)
    .slice(0, MAX_CONTACT_SHARES);
  return Object.fromEntries(kept.map((c) => [c.senderDid, c]));
}

/** Keep the newest `MAX_INCOMING_PER_SENDER` per sender and `MAX_INCOMING` overall. */
function capIncoming(incoming: Record<string, IncomingPassportRequest>): Record<string, IncomingPassportRequest> {
  const newestFirst = Object.values(incoming).sort((a, b) => b.receivedAt - a.receivedAt);
  const perSender = new Map<string, number>();
  const kept: Record<string, IncomingPassportRequest> = {};
  let total = 0;
  for (const request of newestFirst) {
    const n = perSender.get(request.senderHex) ?? 0;
    if (n >= MAX_INCOMING_PER_SENDER || total >= MAX_INCOMING) continue;
    perSender.set(request.senderHex, n + 1);
    kept[request.id] = request;
    total += 1;
  }
  return kept;
}

export const usePrivateExchangeStore = create<PrivateExchangeState>((set, get) => {
  const commit = (next: Persisted, epoch: LocalDataEpoch): boolean => {
    if (!canCommitLocalData(epoch)) return false;
    try {
      getMmkv().set(STORE_KEY, JSON.stringify(next));
    } catch {
      // Still applied in memory; the next successful write persists it.
    }
    set(next);
    return true;
  };
  const current = (): Persisted => {
    if (!get().hydrated) get().hydrate();
    return pick(get());
  };

  return {
    ...EMPTY,
    hydrated: false,
    hydrate: () => {
      if (get().hydrated) return;
      set({ ...readPersisted(), hydrated: true });
    },
    addOutgoing: (request, epoch) => {
      const s = current();
      return commit({ ...s, outgoing: { ...s.outgoing, [request.id]: request } }, epoch);
    },
    answerOutgoing: (id, answer, epoch) => {
      const s = current();
      const request = s.outgoing[id];
      if (request?.answer !== null) return false;
      return commit({ ...s, outgoing: { ...s.outgoing, [id]: { ...request, answer } } }, epoch);
    },
    addIncoming: (request, epoch) => {
      const s = current();
      if (s.incoming[request.id] !== undefined) return false;
      return commit({ ...s, incoming: capIncoming({ ...s.incoming, [request.id]: request }) }, epoch);
    },
    setIncomingStatus: (id, status, epoch) => {
      const s = current();
      const request = s.incoming[id];
      if (request === undefined) return false;
      return commit({ ...s, incoming: { ...s.incoming, [id]: { ...request, status } } }, epoch);
    },
    addContactShare: (share, epoch) => {
      const s = current();
      const existing = s.contacts[share.senderDid];
      if (existing !== undefined && existing.sharedAt >= share.sharedAt) return false;
      return commit({ ...s, contacts: capContacts({ ...s.contacts, [share.senderDid]: share }) }, epoch);
    },
    removeContactShare: (senderDid, epoch) => {
      const s = current();
      if (s.contacts[senderDid] === undefined) return false;
      const { [senderDid]: _removed, ...contacts } = s.contacts;
      return commit({ ...s, contacts }, epoch);
    },
    recordContactSent: (recipientDid, draft, at, epoch) => {
      const s = current();
      return commit(
        { ...s, contactDraft: { ...draft, note: '' }, contactsSent: { ...s.contactsSent, [recipientDid]: at } },
        epoch
      );
    },
    markSeen: (wrapIds, cursor, epoch) => {
      const s = current();
      const now = Math.floor(Date.now() / 1000);
      const seen: Record<string, number> = {};
      for (const [id, at] of Object.entries(s.seen)) if (now - at < SEEN_RETENTION_SECONDS) seen[id] = at;
      for (const id of wrapIds) seen[id] ??= now;
      return commit({ ...s, seen, cursor: cursor ?? s.cursor }, epoch);
    },
    resetForLocalWipe: () => {
      set({ ...EMPTY, hydrated: true });
    },
  };
});

export function getPrivateExchangeSnapshot(): Persisted {
  const state = usePrivateExchangeStore.getState();
  if (!state.hydrated) state.hydrate();
  return pick(usePrivateExchangeStore.getState());
}
