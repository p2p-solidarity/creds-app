import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed';
import { personSearchText, type Person } from '@/people/person';

export interface ContactSection {
  readonly title: string;
  readonly entries: readonly Person[];
}

export type ContactListItem =
  | { readonly kind: 'header'; readonly key: string; readonly title: string }
  | { readonly kind: 'person'; readonly key: string; readonly person: Person };

const NAME_COLLATOR = new Intl.Collator('en', {
  usage: 'sort',
  sensitivity: 'base',
  numeric: true,
});

/**
 * Filter and group people (saved Pages and manual contacts alike) into one
 * A–Z list.
 *
 * Sorting rules are intentionally locale-stable: trim the name, fold Latin
 * diacritics (so “Élodie” belongs under E), group ASCII A–Z first, and put
 * every non-Latin/unnamed contact in one trailing “#” section. Names within a
 * section use case-insensitive natural ordering, with the opaque id as the
 * deterministic tie-breaker.
 */
export function groupContactsByInitial(
  all: readonly Person[],
  query: string,
): readonly ContactSection[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matching = normalizedQuery.length === 0
    ? all
    : all.filter((person) => personSearchText(person).toLocaleLowerCase().includes(normalizedQuery));

  const sorted = [...matching].sort((a, b) => {
    const nameA = a.name;
    const nameB = b.name;
    const sectionOrder = compareSectionTitles(sectionTitle(nameA), sectionTitle(nameB));
    if (sectionOrder !== 0) return sectionOrder;
    const nameOrder = NAME_COLLATOR.compare(nameA.trim(), nameB.trim());
    return nameOrder !== 0 ? nameOrder : a.key.localeCompare(b.key);
  });

  const sections: { title: string; entries: Person[] }[] = [];
  for (const entry of sorted) {
    const title = sectionTitle(entry.name);
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
    ...section.entries.map<ContactListItem>((person) => ({ kind: 'person', key: person.key, person })),
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
