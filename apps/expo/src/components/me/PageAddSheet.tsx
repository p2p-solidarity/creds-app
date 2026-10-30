/**
 * PageAddSheet — the Page tab's one "＋ 新增" sheet, laid out like Linktree's
 * Add sheet: a paste-or-search field on top, then 建議 as one vertical list —
 * 連結 / 音樂 / 表單 / 證明 first, then platforms as brand-coloured round badges,
 * each with a one-line description — and the Page's section types. No grid of
 * squares (Kidney, 2026-10-30).
 *
 * Everything happens inside this one sheet: a platform opens the add-link flow
 * on its handle field, a pasted URL is saved straight away (or offered as a
 * player when it is Spotify / YouTube), music and forms get their own step
 * (`PageEmbedFlow`). Only the choices that leave the Page tab — importing,
 * the passport proof, the Pro screen — close the sheet first and run after
 * its exit, so the next screen never slides in under a sheet still leaving.
 */
import type { SFSymbol } from 'expo-symbols';
import { router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalSheet, sheetTopInset } from '@/components/common/ModalSheet';
import type { BrandBadgeName } from '@/components/icons/BrandBadge';
import { ThemedButton, ThemedText, ThemedTextInput } from '@/components/themed';
import { haptic } from '@/feedback/haptics';
import { pushToast } from '@/feedback/toast';
import { translate, useTranslation } from '@/i18n';
import { MAX_PAGE_BLOCK_COUNT, PAGE_BLOCK_CATALOG, type PageBlockType } from '@/page/pageDesign';
import { usePageDesignStore } from '@/page/pageDesignStore';
import { classifyMediaUrl } from '@/page/richMedia';
import { brandIconForLink, linkDisplay } from '@/profile/linkPresentation';
import type { LinkLabelPreset } from '@/profile/linkUrl';
import { applyPagePhoto, quickAddLink } from '@/profile/quickAddLink';
import { useProGate } from '@/pro/useProGate';

import { AddLinkFlow, SheetHeader, detectPasted, type AddLinkOutcome, type LinkSheetValue } from './AddLinkSheet';
import { ListRow, RowGroup, type AddRow } from './AddListRow';
import { PageEmbedFlow, type EmbedKind } from './PageEmbedFlow';
import { PageSectionLabel } from './PageSectionLabel';

type SectionType = Exclude<PageBlockType, 'links'>;

type Step =
  | { readonly kind: 'menu' }
  | { readonly kind: 'link'; readonly preset: LinkLabelPreset | null; readonly url: string | null }
  | { readonly kind: 'embed'; readonly embed: EmbedKind; readonly url: string | null };

const SECTION_ICON: Readonly<Record<SectionType, SFSymbol>> = {
  text: 'text.quote',
  portfolio: 'photo',
  featured: 'sparkles',
  video: 'play.rectangle.fill',
  shop: 'tag',
  'leave-card': 'person.text.rectangle',
  booking: 'calendar.badge.checkmark',
};

/** Linktree's "Suggested" order: the big social platforms first. */
const SUGGESTED: readonly {
  readonly key: string;
  readonly badge: BrandBadgeName;
  readonly keywords: string;
  readonly target: { readonly preset: LinkLabelPreset | null } | { readonly embed: EmbedKind };
}[] = [
  { key: 'instagram', badge: 'instagram', keywords: 'instagram ig', target: { preset: 'instagram' } },
  { key: 'x', badge: 'x', keywords: 'x twitter', target: { preset: 'x' } },
  { key: 'threads', badge: 'threads', keywords: 'threads', target: { preset: 'threads' } },
  { key: 'youtube', badge: 'youtube', keywords: 'youtube yt', target: { preset: 'youtube' } },
  { key: 'tiktok', badge: 'tiktok', keywords: 'tiktok', target: { preset: 'tiktok' } },
  { key: 'spotify', badge: 'spotify', keywords: 'spotify music', target: { embed: 'music' } },
  { key: 'github', badge: 'github', keywords: 'github git', target: { preset: 'github' } },
  { key: 'linkedin', badge: 'linkedin', keywords: 'linkedin', target: { preset: 'linkedin' } },
  { key: 'telegram', badge: 'telegram', keywords: 'telegram tg', target: { preset: 'telegram' } },
  { key: 'website', badge: 'globe', keywords: 'website web site url', target: { preset: 'website' } },
  { key: 'maps', badge: 'maps', keywords: 'map maps google apple location', target: { preset: null } },
];

export interface PageAddSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onImportLinks: () => void;
  readonly onAddProof: () => void;
}

export function PageAddSheet({ visible, onClose, onImportLinks, onAddProof }: PageAddSheetProps): ReactNode {
  // A route to push once the sheet is gone. iOS reports the end of the
  // dismissal (`onDismiss`); Android has no such event, so it runs at once.
  const afterDismiss = useRef<(() => void) | null>(null);
  const finish = (after?: () => void) => {
    onClose();
    if (after === undefined) return;
    if (Platform.OS === 'ios') afterDismiss.current = after;
    else after();
  };
  return (
    <ModalSheet
      visible={visible}
      onRequestClose={onClose}
      onDismiss={() => {
        const run = afterDismiss.current;
        afterDismiss.current = null;
        run?.();
      }}>
      {visible ? <PageAddContent finish={finish} onImportLinks={onImportLinks} onAddProof={onAddProof} /> : null}
    </ModalSheet>
  );
}

function PageAddContent({
  finish,
  onImportLinks,
  onAddProof,
}: {
  readonly finish: (after?: () => void) => void;
  readonly onImportLinks: () => void;
  readonly onAddProof: () => void;
}): ReactNode {
  const [step, setStep] = useState<Step>({ kind: 'menu' });
  const toMenu = () => { setStep({ kind: 'menu' }); };

  if (step.kind === 'link') {
    return (
      <AddLinkFlow
        initialLink={null}
        initialPreset={step.preset}
        initialUrl={step.url}
        onSave={saveLink}
        onUseAvatar={applyPagePhoto}
        onClose={() => { finish(); }}
        onExit={toMenu}
      />
    );
  }
  if (step.kind === 'embed') {
    return <PageEmbedFlow kind={step.embed} initialUrl={step.url} onBack={toMenu} onDone={() => { finish(); }} />;
  }
  return (
    <AddMenu
      finish={finish}
      onPick={setStep}
      onImportLinks={onImportLinks}
      onAddProof={onAddProof}
    />
  );
}

/** Save a link at once (the Page tab's add-and-check flow). */
async function saveLink(link: LinkSheetValue): Promise<AddLinkOutcome> {
  const added = await quickAddLink({ label: link.label, url: link.url });
  if (added.ok) {
    haptic('success');
    return { kind: 'saved', ...added.value };
  }
  if (added.error === 'duplicate') pushToast(translate('meEdit.linkSheet.duplicate'), 'warning');
  else if (added.error === 'saveFailed') pushToast(translate('meEdit.saveFailed'), 'error');
  return { kind: 'failed' };
}

function AddMenu({
  finish,
  onPick,
  onImportLinks,
  onAddProof,
}: {
  readonly finish: (after?: () => void) => void;
  readonly onPick: (step: Step) => void;
  readonly onImportLinks: () => void;
  readonly onAddProof: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const status = usePageDesignStore((state) => state.status);
  const blockCount = usePageDesignStore((state) => state.design.blocks.length);
  const addBlock = usePageDesignStore((state) => state.addBlock);
  const { locked } = useProGate();

  const sectionsFull = blockCount >= MAX_PAGE_BLOCK_COUNT;
  const sectionsUnavailable = status !== 'ready' || sectionsFull;
  const sectionsNote = status === 'loading'
    ? t('pageDesign.loading')
    : status === 'error'
      ? t('pageDesign.loadError')
      : sectionsFull
        ? t('pageAdd.sectionsFull', { count: MAX_PAGE_BLOCK_COUNT })
        : null;

  // What used to be four squares on top now leads the one scrolling list.
  const quick: readonly AddRow[] = [
    {
      key: 'link',
      title: t('pageAdd.tile.link'),
      description: t('pageAdd.tileDesc.link'),
      keywords: 'link url',
      badge: null,
      icon: 'link',
      onPress: () => { onPick({ kind: 'link', preset: null, url: null }); },
    },
    {
      key: 'music',
      title: t('pageAdd.tile.music'),
      description: t('pageAdd.tileDesc.music'),
      keywords: 'music spotify youtube player',
      badge: null,
      icon: 'music.note',
      onPress: () => { onPick({ kind: 'embed', embed: 'music', url: null }); },
    },
    {
      key: 'form',
      title: t('pageAdd.tile.form'),
      description: t('pageAdd.tileDesc.form'),
      keywords: 'form google forms tally typeform questionnaire',
      badge: null,
      icon: 'list.bullet.clipboard',
      onPress: () => { onPick({ kind: 'embed', embed: 'form', url: null }); },
    },
    {
      key: 'proof',
      title: t('pageAdd.tile.proof'),
      description: t('pageAdd.tileDesc.proof'),
      keywords: 'proof passport check verify',
      badge: null,
      icon: 'checkmark.shield',
      onPress: () => { finish(onAddProof); },
    },
  ];

  const suggested: readonly AddRow[] = [
    ...quick,
    ...SUGGESTED.map((entry) => ({
      key: entry.key,
      title: t(`pageAdd.platform.${entry.key}`),
      description: t(`pageAdd.platformDesc.${entry.key}`),
      keywords: entry.keywords,
      badge: entry.badge,
      onPress: () => {
        onPick('embed' in entry.target
          ? { kind: 'embed', embed: entry.target.embed, url: null }
          : { kind: 'link', preset: entry.target.preset, url: null });
      },
    })),
    {
      key: 'import',
      title: t('mePage.importLinks'),
      description: t('pageAdd.platformDesc.import'),
      keywords: 'import linktree lit.link',
      badge: 'linktree',
      onPress: () => { finish(onImportLinks); },
    },
  ];

  const sections: readonly AddRow[] = PAGE_BLOCK_CATALOG.flatMap((entry) => {
    if (entry.type === 'links') return [];
    const type: SectionType = entry.type;
    const label = t(`pageDesign.block.${type}`);
    const entryLocked = locked(entry.pro);
    return [{
      key: type,
      title: label,
      description: t(`pageAdd.blockDesc.${type}`),
      keywords: entry.defaultTitle,
      badge: null,
      icon: SECTION_ICON[type],
      pro: entryLocked,
      disabled: sectionsUnavailable,
      onPress: () => {
        if (entryLocked) {
          finish(() => { router.push('/settings/pro'); });
          return;
        }
        if (addBlock(type, label) !== null) {
          haptic('success');
          pushToast(t('pageAdd.addedToDraft'), 'success');
        }
        finish();
      },
    }];
  });

  const trimmed = query.trim();
  const pasted = trimmed.includes('.') ? detectPasted(trimmed) : null;
  const pastedMedia = pasted === null ? null : classifyMediaUrl(pasted.url);
  const needle = trimmed.toLowerCase();
  const matches = (row: AddRow) =>
    `${row.title} ${row.description} ${row.keywords}`.toLowerCase().includes(needle);
  const shownSuggested = needle.length === 0 ? suggested : suggested.filter(matches);
  const shownSections = needle.length === 0 ? sections : sections.filter(matches);

  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: sheetTopInset(insets.top) }}>
      <SheetHeader title={t('pageAdd.title')} canGoBack={false} onClose={() => { finish(); }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 22 }}>
        <ThemedTextInput
          value={query}
          onChangeText={setQuery}
          icon="magnifyingglass"
          placeholder={t('pageAdd.searchPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          showPaste
          showClear
          returnKeyType="search"
        />

        {pasted !== null ? (
          <View style={{ gap: 8 }}>
            <PageSectionLabel title={t('pageAdd.pasted')} />
            <ListRow
              row={{
                key: 'pasted-link',
                title: linkDisplay(pasted.label, pasted.url).text,
                description: t('pageAdd.addAsLink'),
                keywords: '',
                badge: brandIconForLink(pasted.label, pasted.url),
                onPress: () => { onPick({ kind: 'link', preset: null, url: pasted.url }); },
              }}
            />
            {pastedMedia !== null ? (
              <ListRow
                row={{
                  key: 'pasted-player',
                  title: t('pageAdd.embedPlayer'),
                  description: t(pastedMedia.kind === 'spotify' ? 'pageAdd.embedPlayerSpotify' : 'pageAdd.embedPlayerYoutube'),
                  keywords: '',
                  badge: pastedMedia.kind === 'spotify' ? 'spotify' : 'youtube',
                  onPress: () => { onPick({ kind: 'embed', embed: 'music', url: pasted.url }); },
                }}
              />
            ) : null}
          </View>
        ) : null}


        {shownSuggested.length > 0 && pasted === null ? (
          <RowGroup title={t('pageAdd.suggested')} rows={shownSuggested} />
        ) : null}
        {shownSections.length > 0 && pasted === null ? (
          <RowGroup title={t('mePage.sections')} note={sectionsNote} rows={shownSections} />
        ) : null}

        {pasted === null && needle.length > 0 && shownSuggested.length === 0 && shownSections.length === 0 ? (
          <View style={{ gap: 12, alignItems: 'flex-start' }}>
            <ThemedText variant="bodyMedium" tone="secondary">{t('pageAdd.noResults', { query: trimmed })}</ThemedText>
            <ThemedButton
              label={t('pageAdd.tile.link')}
              icon="link"
              variant="secondary"
              size="sm"
              onPress={() => { onPick({ kind: 'link', preset: null, url: null }); }}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

