/**
 * LegalDocumentView — the Privacy Policy / Terms of Service body, laid out the
 * way creds.id/privacy and creds.id/terms are: date and intro, a Key points
 * card, then each part's numbered sections as their own rounded cards, with
 * subheadings and bullet lists inside. The text is the bundled copy in
 * `src/legal/documents.ts` (generated from airmeishi-web), so it reads offline.
 */
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedSurface, ThemedText } from '@/components/themed';
import { useTranslation } from '@/i18n';
import { LEGAL_CONTACT_EMAIL, LEGAL_DOCUMENTS, LEGAL_EFFECTIVE_DATE } from '@/legal/documents';
import type { LegalBlock, LegalDocumentId, LegalSection } from '@/legal/types';

export function LegalDocumentView({ documentId }: { readonly documentId: LegalDocumentId }): ReactNode {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('zh') ? 'zh-Hant' : 'en';
  const doc = LEGAL_DOCUMENTS[locale][documentId];

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48 + insets.bottom, gap: 24 }}
    >
      <View style={{ gap: 8 }}>
        <ThemedText variant="bodySmall" tone="tertiary">
          {t('legal.effectiveDate', { date: LEGAL_EFFECTIVE_DATE })}
        </ThemedText>
        <ThemedText variant="bodyMedium" tone="secondary" style={{ lineHeight: 23 }}>
          {doc.intro}
        </ThemedText>
      </View>

      <ThemedSurface padded style={{ gap: 10 }}>
        <ThemedText variant="titleMedium">{t('legal.highlights')}</ThemedText>
        <BulletList items={doc.highlights} />
      </ThemedSurface>

      {doc.parts.map((part) => (
        <View key={part.title} style={{ gap: 12 }}>
          <ThemedText variant="label" tone="tertiary" className="px-1">
            {part.title}
          </ThemedText>
          {part.sections.map((section) => <SectionCard key={section.id} section={section} />)}
        </View>
      ))}

      <ThemedText variant="bodySmall" tone="tertiary" className="text-center">
        {`${LEGAL_CONTACT_EMAIL} · creds.id/${documentId}`}
      </ThemedText>
    </ScrollView>
  );
}

function SectionCard({ section }: { readonly section: LegalSection }): ReactNode {
  return (
    <ThemedSurface padded style={{ gap: 10 }}>
      <ThemedText variant="titleMedium">{section.title}</ThemedText>
      {section.blocks.map((block, i) => <Block key={i} block={block} first={i === 0} />)}
    </ThemedSurface>
  );
}

function Block({ block, first }: { readonly block: LegalBlock; readonly first: boolean }): ReactNode {
  if (typeof block === 'string') {
    return (
      <ThemedText variant="bodyMedium" tone="secondary" style={{ lineHeight: 23 }}>
        {block}
      </ThemedText>
    );
  }
  if ('heading' in block) {
    return (
      <ThemedText variant="label" style={{ marginTop: first ? 0 : 6 }}>
        {block.heading}
      </ThemedText>
    );
  }
  return <BulletList items={block.list} />;
}

function BulletList({ items }: { readonly items: readonly string[] }): ReactNode {
  return (
    <View style={{ gap: 8 }}>
      {items.map((item) => (
        <View key={item} className="flex-row" style={{ gap: 10 }}>
          <View className="rounded-full bg-text3" style={{ width: 5, height: 5, marginTop: 9 }} />
          <ThemedText variant="bodyMedium" tone="secondary" className="flex-1" style={{ lineHeight: 23 }}>
            {item}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}
