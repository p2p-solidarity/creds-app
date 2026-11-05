/**
 * Person — the one contact the People screens read.
 *
 * Storage stays split (a saved Page is a signed record in
 * `profileSnapshots`, a manual contact is an encrypted `Contact` in
 * `contacts/repository`), but the screens never branch on "which store": a
 * person has an optional signed `page` and an optional hand-entered
 * `contact`. Merging is a link the user confirms (`VerifiedSnapshot.
 * linkedContactId`), never a copy: the signed Page stays as signed and the
 * user's own fields stay theirs, and unmerging gives both back unchanged.
 */
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';

import { useContactList, type ContactManifestEntry } from '@/contacts/repository';
import { hostnameOf } from '@/profile/linkPresentation';
import { getMmkv } from '@/storage/mmkv';

import { resolvePageUsername } from './pageUsername';
import {
  sortedProfileSnapshots,
  useProfileSnapshotStore,
  type DeclaredSnapshot,
  type ProfileSnapshot,
  type VerifiedSnapshot,
} from './profileSnapshots';

export interface Person {
  /** List / selection key: `page:<did>`, `page:<declaredId>` or the contact id. */
  readonly key: string;
  readonly name: string;
  /** creds.id name without `@`, only when checked both ways. */
  readonly username: string | null;
  readonly page: VerifiedSnapshot | null;
  /** An imported link page (Linktree…): unsigned, never shown as verified. */
  readonly declared: DeclaredSnapshot | null;
  readonly contact: ContactManifestEntry | null;
}

export function snapshotDisplayName(snapshot: ProfileSnapshot): string {
  if (snapshot.kind === 'verified') return snapshot.record.displayName;
  return snapshot.title && snapshot.title.trim().length > 0 ? snapshot.title : hostnameOf(snapshot.sourceUrl);
}

export function buildPeople(
  contacts: readonly ContactManifestEntry[],
  snapshots: readonly ProfileSnapshot[],
): readonly Person[] {
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  const absorbed = new Set<string>();
  const people: Person[] = [];
  for (const snapshot of snapshots) {
    if (snapshot.kind === 'declared') {
      people.push({
        key: `page:${snapshot.id}`,
        name: snapshotDisplayName(snapshot),
        username: null,
        page: null,
        declared: snapshot,
        contact: null,
      });
      continue;
    }
    const linked =
      snapshot.linkedContactId !== null && !absorbed.has(snapshot.linkedContactId)
        ? byId.get(snapshot.linkedContactId) ?? null
        : null;
    if (linked) absorbed.add(linked.id);
    people.push({
      key: `page:${snapshot.did}`,
      name: snapshot.record.displayName,
      username: snapshot.handle,
      page: snapshot,
      declared: null,
      contact: linked,
    });
  }
  for (const contact of contacts) {
    if (absorbed.has(contact.id)) continue;
    people.push({ key: contact.id, name: contact.name, username: null, page: null, declared: null, contact });
  }
  return people;
}

export function personSearchText(person: Person): string {
  return [
    person.name,
    person.username,
    person.username === null ? null : `@${person.username}`,
    person.contact?.name,
    person.contact?.company,
    person.contact?.title,
    person.declared?.sourceUrl,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join('\n');
}

/** Name equality for merge suggestions: Unicode-folded, case- and
 *  whitespace-insensitive. Only exact full names match — "Gimmy" never
 *  suggests "Gimmy Chang". */
export function sameNameKey(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

export interface MergeSuggestion {
  readonly key: string;
  readonly page: VerifiedSnapshot;
  readonly contact: ContactManifestEntry;
}

export function mergePairKey(did: string, contactId: string): string {
  return `${did}|${contactId}`;
}

/** Same-full-name pairs of an unmerged Page and an unmerged manual contact.
 *  A name shared by several on one side is ambiguous, so it is not offered. */
export function findMergeSuggestions(
  people: readonly Person[],
  dismissed: ReadonlySet<string>,
): readonly MergeSuggestion[] {
  const pages = new Map<string, VerifiedSnapshot[]>();
  const contacts = new Map<string, ContactManifestEntry[]>();
  for (const person of people) {
    if (person.page && !person.contact) {
      const k = sameNameKey(person.page.record.displayName);
      if (k.length > 0) pages.set(k, [...(pages.get(k) ?? []), person.page]);
    } else if (person.contact && !person.page) {
      const k = sameNameKey(person.contact.name);
      if (k.length > 0) contacts.set(k, [...(contacts.get(k) ?? []), person.contact]);
    }
  }
  const out: MergeSuggestion[] = [];
  for (const [k, pageList] of pages) {
    const contactList = contacts.get(k);
    if (pageList.length !== 1 || contactList?.length !== 1) continue;
    const page = pageList[0];
    const contact = contactList[0];
    if (!page || !contact) continue;
    const key = mergePairKey(page.did, contact.id);
    if (!dismissed.has(key)) out.push({ key, page, contact });
  }
  return out;
}

/** People list for the tab: every saved Page and contact, merged ones once. */
export function usePeople(): readonly Person[] {
  const contacts = useContactList();
  const snapshots = useProfileSnapshotStore(useShallow((s) => sortedProfileSnapshots(s.snapshots)));
  return useMemo(() => buildPeople(contacts, snapshots), [contacts, snapshots]);
}

/** The Page a manual contact was merged into, if any. */
export function usePageLinkedTo(contactId: string | undefined): VerifiedSnapshot | undefined {
  return useProfileSnapshotStore((s) => {
    if (!contactId) return undefined;
    for (const snapshot of s.snapshots.values()) {
      if (snapshot.kind === 'verified' && snapshot.linkedContactId === contactId) return snapshot;
    }
    return undefined;
  });
}

// ── Dismissed merge suggestions ────────────────────────────────────────────

const DISMISSED_KEY = 'people:mergeDismissed:v1';

function readDismissed(): ReadonlySet<string> {
  try {
    const raw = getMmkv().getString(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

interface DismissedState {
  readonly dismissed: ReadonlySet<string> | null;
  readonly hydrate: () => void;
  readonly dismiss: (key: string) => void;
}

export const useMergeDismissals = create<DismissedState>((set, get) => ({
  dismissed: null,
  hydrate: () => {
    if (get().dismissed === null) set({ dismissed: readDismissed() });
  },
  dismiss: (key) => {
    const next = new Set(get().dismissed ?? readDismissed());
    next.add(key);
    try {
      getMmkv().set(DISMISSED_KEY, JSON.stringify([...next]));
    } catch {
      // Not persisted this time; the suggestion stays hidden for this session.
    }
    set({ dismissed: next });
  },
}));

export function useMergeSuggestions(people: readonly Person[]): readonly MergeSuggestion[] {
  const dismissed = useMergeDismissals((s) => s.dismissed);
  const hydrate = useMergeDismissals((s) => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);
  return useMemo(
    () => (dismissed === null ? [] : findMergeSuggestions(people, dismissed)),
    [people, dismissed],
  );
}

// ── creds.id names for saved Pages ─────────────────────────────────────────

/** dids checked this app session — one lookup per Page per launch. */
const checkedThisSession = new Set<string>();

/**
 * Re-checks the creds.id name of every saved Page once per launch, one at a
 * time: a name can be released or move to another key, so a stored name is
 * re-confirmed, and cleared only when the check definitively says it no
 * longer holds (an offline check keeps the last good name).
 */
export function useCheckPageUsernames(people: readonly Person[]): void {
  const setHandle = useProfileSnapshotStore((s) => s.setHandle);
  const pending = people.flatMap((person) =>
    person.page && !checkedThisSession.has(person.page.did) ? [person.page] : [],
  );
  const pendingKey = pending.map((page) => page.did).join(',');
  useEffect(() => {
    if (pending.length === 0) return;
    for (const page of pending) checkedThisSession.add(page.did);
    void (async () => {
      for (const page of pending) {
        const result = await resolvePageUsername(page.record).catch(() => ({ kind: 'unknown' as const }));
        if (result.kind === 'name' && result.name !== page.handle) setHandle(page.did, result.name);
        else if (result.kind === 'none' && page.handle !== null) setHandle(page.did, null);
      }
    })();
    // Keyed on `pendingKey` (the dids `pending` holds), not the fresh array.
  }, [pendingKey, setHandle]);
}
