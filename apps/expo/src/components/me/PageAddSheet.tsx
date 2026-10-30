/**
 * PageAddSheet — the Page tab's one "＋ 新增" sheet, laid out like Linktree's
 * Add sheet: a paste-or-search field on top, a row of category tiles
 * (連結 / 音樂 / 表單 / 證明), then 建議 — platforms as brand-coloured round
 * badges with a one-line description — and the Page's section types.
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

import { ModalSheet } from '@/components/common/ModalSheet';
import { PressableScale } from '@/components/common/PressableScale';
import { BrandBadge, type BrandBadgeName } from '@/components/icons/BrandBadge';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedButton, ThemedText, ThemedTextInput } from '@/components/themed';
import { Radius } from '@/constants/radius';
import { useThemeColors } from '@/constants/useThemeColors';
import { haptic } from '@/feedback/haptics';
import { SCALE } from '@/feedback/motion';
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

/** One row of the list: a platform, a section type, or the import entry. */
interface AddRow {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  /** Extra words the search matches (host names, English names). */
  readonly keywords: string;
  readonly badge: BrandBadgeName | null;
  readonly icon?: SFSymbol;
  readonly pro?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}

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

  const suggested: readonly AddRow[] = [
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
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
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

        {needle.length === 0 ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <CategoryTile icon="link" label={t('pageAdd.tile.link')} onPress={() => { onPick({ kind: 'link', preset: null, url: null }); }} />
            <CategoryTile icon="music.note" label={t('pageAdd.tile.music')} onPress={() => { onPick({ kind: 'embed', embed: 'music', url: null }); }} />
            <CategoryTile icon="list.bullet.clipboard" label={t('pageAdd.tile.form')} onPress={() => { onPick({ kind: 'embed', embed: 'form', url: null }); }} />
            <CategoryTile icon="checkmark.shield" label={t('pageAdd.tile.proof')} onPress={() => { finish(onAddProof); }} />
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

/** Linktree's category square: a tinted tile with the glyph, label below. */
function CategoryTile({
  icon,
  label,
  onPress,
}: {
  readonly icon: SFSymbol;
  readonly label: string;
  readonly onPress: () => void;
}): ReactNode {
  const c = useThemeColors();
  return (
    <PressableScale
      fill
      haptic="tap"
      scaleTo={SCALE.tile}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ flex: 1, alignItems: 'center', gap: 8 }}>
      <View
        style={{
          alignSelf: 'stretch',
          aspectRatio: 1,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: Radius.card,
          borderWidth: 1,
          borderColor: c.divider,
          backgroundColor: c.cardBg,
        }}>
        <SfIcon name={icon} size={26} color={c.primaryBlue} weight="medium" />
      </View>
      <ThemedText variant="bodySmall" numberOfLines={1} style={{ textAlign: 'center' }}>
        {label}
      </ThemedText>
    </PressableScale>
  );
}

function RowGroup({
  title,
  note = null,
  rows,
}: {
  readonly title: string;
  readonly note?: string | null;
  readonly rows: readonly AddRow[];
}): ReactNode {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <PageSectionLabel title={title} />
        </View>
        {note !== null ? (
          <ThemedText variant="caption" tone="tertiary" numberOfLines={1}>{note}</ThemedText>
        ) : null}
      </View>
      {rows.map((row, index) => <ListRow key={row.key} row={row} divided={index < rows.length - 1} />)}
    </View>
  );
}

/** Badge, title, one-line description; a hairline under every row but the last. */
function ListRow({ row, divided = false }: { readonly row: AddRow; readonly divided?: boolean }): ReactNode {
  const c = useThemeColors();
  const disabled = row.disabled === true;
  return (
    <PressableScale
      haptic={disabled ? false : 'tap'}
      disabled={disabled}
      onPress={row.onPress}
      accessibilityRole="button"
      accessibilityLabel={row.pro ? `${row.title}, PRO` : row.title}
      accessibilityHint={row.description}
      accessibilityState={{ disabled }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, opacity: disabled ? 0.4 : 1 }}>
      {row.badge !== null ? (
        <BrandBadge name={row.badge} size={44} />
      ) : (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: Radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.chipSurface,
          }}>
          {row.icon ? <SfIcon name={row.icon} size={20} color={c.primaryBlue} /> : null}
        </View>
      )}
      <View
        style={{
          flex: 1,
          gap: 2,
          alignSelf: 'stretch',
          justifyContent: 'center',
          paddingVertical: 14,
          borderBottomWidth: divided ? 1 : 0,
          borderBottomColor: c.divider,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ThemedText variant="titleMedium" numberOfLines={1} style={{ flexShrink: 1 }}>{row.title}</ThemedText>
          {row.pro ? (
            <View style={{ paddingHorizontal: 6, borderRadius: Radius.pill, backgroundColor: c.chipSurface }}>
              <ThemedText variant="caption" style={{ color: c.primaryBlue, letterSpacing: 0.6 }}>PRO</ThemedText>
            </View>
          ) : null}
        </View>
        <ThemedText variant="bodySmall" tone="secondary" numberOfLines={1}>{row.description}</ThemedText>
      </View>
    </PressableScale>
  );
}
