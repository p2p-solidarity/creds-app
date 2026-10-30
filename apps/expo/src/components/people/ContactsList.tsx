import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed';
import type { ContactManifestEntry } from '@/contacts/repository';
import type { ProfileSnapshot } from '@/people/profileSnapshots';
import { hostnameOf } from '@/profile/linkPresentation';

/** One person in the A–Z list: a saved contact or a saved Page. */
export type PeopleEntry =
  | { readonly kind: 'contact'; readonly contact: ContactManifestEntry }
  | { readonly kind: 'page'; readonly snapshot: ProfileSnapshot };

export interface ContactSection {
  readonly title: string;
  readonly entries: readonly PeopleEntry[];
}

export type ContactListItem =
  | { readonly kind: 'header'; readonly key: string; readonly title: string }
  | { readonly kind: 'contact'; readonly key: string; readonly contact: ContactManifestEntry }
  | { readonly kind: 'page'; readonly key: string; readonly snapshot: ProfileSnapshot };

export function snapshotDisplayName(snapshot: ProfileSnapshot): string {
  if (snapshot.kind === 'verified') return snapshot.record.displayName;
  return snapshot.title && snapshot.title.trim().length > 0 ? snapshot.title : hostnameOf(snapshot.sourceUrl);
}

function entryName(entry: PeopleEntry): string {
  return entry.kind === 'contact' ? entry.contact.name : snapshotDisplayName(entry.snapshot);
}

function entryId(entry: PeopleEntry): string {
  if (entry.kind === 'contact') return entry.contact.id;
  return entry.snapshot.kind === 'verified' ? `page:${entry.snapshot.did}` : `page:${entry.snapshot.id}`;
}

function entrySearchText(entry: PeopleEntry): string {
  if (entry.kind === 'contact') {
    return [entry.contact.name, entry.contact.company, entry.contact.title]
      .filter((value): value is string => typeof value === 'string')
      .join('\n');
  }
  const { snapshot } = entry;
  return snapshot.kind === 'verified'
    ? snapshot.record.displayName
    : [snapshotDisplayName(snapshot), snapshot.sourceUrl].join('\n');
}

const NAME_COLLATOR = new Intl.Collator('en', {
  usage: 'sort',
  sensitivity: 'base',
  numeric: true,
});

/**
 * Filter and group contacts and saved Pages into one A–Z list — a saved Page
 * is a person too, so it sorts in with the contacts instead of in a section
 * of its own.
 *
 * Sorting rules are intentionally locale-stable: trim the name, fold Latin
 * diacritics (so “Élodie” belongs under E), group ASCII A–Z first, and put
 * every non-Latin/unnamed contact in one trailing “#” section. Names within a
 * section use case-insensitive natural ordering, with the opaque id as the
 * deterministic tie-breaker.
 */
export function groupContactsByInitial(
  contacts: readonly ContactManifestEntry[],
  query: string,
  pages: readonly ProfileSnapshot[] = [],
): readonly ContactSection[] {
  const all: PeopleEntry[] = [
    ...contacts.map((contact) => ({ kind: 'contact' as const, contact })),
    ...pages.map((snapshot) => ({ kind: 'page' as const, snapshot })),
  ];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matching = normalizedQuery.length === 0
    ? all
    : all.filter((entry) => entrySearchText(entry).toLocaleLowerCase().includes(normalizedQuery));

  const sorted = [...matching].sort((a, b) => {
    const nameA = entryName(a);
    const nameB = entryName(b);
    const sectionOrder = compareSectionTitles(sectionTitle(nameA), sectionTitle(nameB));
    if (sectionOrder !== 0) return sectionOrder;
    const nameOrder = NAME_COLLATOR.compare(nameA.trim(), nameB.trim());
    return nameOrder !== 0 ? nameOrder : entryId(a).localeCompare(entryId(b));
  });

  const sections: { title: string; entries: PeopleEntry[] }[] = [];
  for (const entry of sorted) {
    const title = sectionTitle(entryName(entry));
    const current = sections[sections.length - 1];
    if (current?.title === title) current.entries.push(entry);
    else sections.push({ title, entries: [entry] });
  }
  return sections;
}

export function flattenContactSections(
  sections: readonly ContactSection[],
  showSectionHeaders: boolean,
): readonly ContactListItem[] {
  return sections.flatMap<ContactListItem>((section) => [
    ...(showSectionHeaders
      ? [{ kind: 'header' as const, key: `header:${section.title}`, title: section.title }]
      : []),
    ...section.entries.map<ContactListItem>((entry) =>
      entry.kind === 'contact'
        ? { kind: 'contact', key: entry.contact.id, contact: entry.contact }
        : { kind: 'page', key: entryId(entry), snapshot: entry.snapshot },
    ),
  ]);
}

export function ContactSectionHeader({ title }: { readonly title: string }): ReactNode {
  return (
    <View style={{ minHeight: 34, justifyContent: 'flex-end', paddingBottom: 4 }}>
      <ThemedText variant="label" tone="secondary">
        {title}
      </ThemedText>
    </View>
  );
}

function sectionTitle(name: string): string {
  const first = name
    .trim()
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .charAt(0)
    .toUpperCase();
  return /^[A-Z]$/u.test(first) ? first : '#';
}

function compareSectionTitles(a: string, b: string): number {
  if (a === b) return 0;
  if (a === '#') return 1;
  if (b === '#') return -1;
  return a.localeCompare(b);
}
