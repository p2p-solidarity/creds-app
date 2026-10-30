import { useEffect, useRef, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SFSymbol } from 'expo-symbols';

import { ModalSheet, sheetTopInset } from '@/components/common/ModalSheet';
import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedButton, ThemedChoiceChip, ThemedSurface, ThemedText, ThemedTextInput } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { useThemeColors } from '@/constants/useThemeColors';
import { useTranslation } from '@/i18n';
import { haptic } from '@/feedback/haptics';
import {
  PAGE_BLOCK_CATALOG,
  MAX_PAGE_BLOCK_TITLE_LENGTH,
  MAX_PAGE_ITEM_PRICE_LENGTH,
  MAX_PAGE_ITEM_TITLE_LENGTH,
  MAX_PAGE_ITEMS_PER_BLOCK,
  MAX_PAGE_SECTIONS,
  blockHasCardSize,
  cardSizeOf,
  createInitialPageDesign,
  pageSectionCount,
  publicPageDesignEquals,
  toPublicPageDesign,
  type PageBlock,
  type PageBlockItem,
} from '@/page/pageDesign';
import { preparePageDesign, usePageDesignStore } from '@/page/pageDesignStore';
import { useProGate } from '@/pro/useProGate';

import { CardSizePicker } from './CardSizePicker';
import { PHONE_SCREEN_RADIUS, PageBlockPreview, PageLivePreview, type PreviewBlockEditing } from './PageLivePreview';
import { PageCollapsibleHeader } from './PageCollapsibleHeader';
import { PublishChangesCard } from './PublishChangesCard';
import { useProfileStore } from '@/profile/store';
import { uuid, type ProfileRecord } from '@solidarity/shared';

export interface ProfileSectionsListProps {
  /** Opens the add sheet scoped to sections (the header's ＋). */
  readonly onAddSection: () => void;
  /** The public projection the preview paints — the same record a visitor
   *  would resolve, not the owner's full one. */
  readonly previewRecord: ProfileRecord;
  /** Real page address for the preview's handle line, when one exists. */
  readonly previewHandle: string | null;
}

export function ProfileSectionsList({
  onAddSection,
  previewRecord,
  previewHandle,
}: ProfileSectionsListProps): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  const status = usePageDesignStore((state) => state.status);
  const error = usePageDesignStore((state) => state.error);
  const design = usePageDesignStore((state) => state.design);
  const blocks = usePageDesignStore((state) => state.design.blocks);
  const moveBlock = usePageDesignStore((state) => state.moveBlock);
  const { locked } = useProGate();
  const record = useProfileStore((state) => state.record);
  const savePageDesign = useProfileStore((state) => state.savePageDesign);
  const [editing, setEditing] = useState<PageBlock | null>(null);
  const [publishing, setPublishing] = useState(false);
  // What the last publish actually did; `done` stays until dismissed or the
  // next edit, `error` until the next try.
  const [publishResult, setPublishResult] = useState<'idle' | 'done' | 'error'>('idle');
  const [open, setOpen] = useState(false);
  const publishedDesign = record?.page ?? toPublicPageDesign(createInitialPageDesign());
  const pageHasChanges = status === 'ready' && record !== null && !publicPageDesignEquals(
    toPublicPageDesign(design),
    publishedDesign,
  );
  const movableBlocks = blocks.filter((block) => block.type !== 'links');

  // A section added from ＋ 新增 unfolds this group, so its placeholder shows
  // up on the page where it will live instead of disappearing into a fold.
  const seenBlockIds = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (status !== 'ready') return;
    const ids = new Set(blocks.map((block) => block.id));
    const previous = seenBlockIds.current;
    seenBlockIds.current = ids;
    if (previous !== null && [...ids].some((id) => !previous.has(id))) setOpen(true);
  }, [blocks, status]);

  /** Pro-only section on a lapsed plan: its controls go to the plan, never edit. */
  const proLocked = (block: PageBlock): boolean =>
    locked(PAGE_BLOCK_CATALOG.find((entry) => entry.type === block.type)?.pro ?? false);

  const blockEditing: PreviewBlockEditing = {
    onEdit: (block) => {
      if (proLocked(block)) openProSettings();
      else setEditing(block);
    },
    // A drop lands `destination` slots away; the store moves one step at a time.
    onMove: (block, destination) => {
      if (proLocked(block)) {
        openProSettings();
        return;
      }
      const from = movableBlocks.findIndex((candidate) => candidate.id === block.id);
      if (from < 0) return;
      const direction = destination < from ? 'up' : 'down';
      for (let step = 0; step < Math.abs(destination - from); step += 1) moveBlock(block.id, direction);
    },
  };

  const publishPageChanges = (): void => {
    if (publishing || !record || status !== 'ready') return;
    setPublishing(true);
    void savePageDesign(toPublicPageDesign(design))
      .then((result) => {
        if (result.ok) {
          haptic('success');
          setPublishResult('done');
          return;
        }
        haptic('error');
        setPublishResult('error');
      })
      .catch(() => {
        haptic('error');
        setPublishResult('error');
      })
      .finally(() => { setPublishing(false); });
  };

  return (
    <View className="gap-3 px-4">
      <PageCollapsibleHeader
        title={t('mePage.sections')}
        summary={status === 'ready' ? `${movableBlocks.length}/${MAX_PAGE_SECTIONS}` : null}
        open={open}
        onToggle={() => { setOpen((current) => !current); }}
        add={{
          label: t('pageDesign.addSection'),
          disabled: status !== 'ready' || movableBlocks.length >= MAX_PAGE_SECTIONS,
          onPress: onAddSection,
        }}
      />

      {!open ? null : status === 'loading' ? (
        <ThemedSurface padded className="items-center gap-2">
          <ActivityIndicator color={Colors.primaryBlue} />
          <ThemedText variant="caption" tone="secondary">{t('pageDesign.loading')}</ThemedText>
        </ThemedSurface>
      ) : status === 'error' ? (
        <ThemedSurface padded className="gap-3" style={{ borderColor: Colors.destructive }}>
          <ThemedText variant="bodyMedium">{t('pageDesign.loadError')}</ThemedText>
          <ThemedText variant="caption" tone="secondary">{error ?? t('pageDesign.loadError')}</ThemedText>
          <ThemedButton
            label={t('mePage.retry')}
            variant="secondary"
            onPress={() => { void preparePageDesign(); }}
          />
        </ThemedSurface>
      ) : (
        <>
          {/* The page itself is the editor: it paints as visitors see it, a
              tapped block opens its editor (order, hide, remove live there)
              and a long-pressed one drags to a new place;
              the links block stays first and is edited from the list above.
              New sections come from the tab's ＋ 新增. */}
          <View
            style={{
              borderRadius: PHONE_SCREEN_RADIUS + 6,
              borderWidth: 1,
              borderColor: c.divider,
              padding: 6,
              backgroundColor: c.cardBg,
            }}>
            <PageLivePreview
              record={previewRecord}
              blocks={blocks}
              appearance={design.appearance}
              handle={previewHandle}
              editing={blockEditing}
            />
          </View>
        </>
      )}

      {/* Outside the fold: unpublished changes always show, folded or not. */}
      {status === 'ready' && (pageHasChanges || publishResult === 'done') ? (
        <PublishChangesCard
          state={
            publishing
              ? { kind: 'publishing' }
              : pageHasChanges
                ? publishResult === 'error' ? { kind: 'error' } : { kind: 'pending' }
                : { kind: 'done', handle: previewHandle }
          }
          onPublish={publishPageChanges}
          onDismiss={() => { setPublishResult('idle'); }}
        />
      ) : null}

      <PageBlockEditorSheet block={editing} onClose={() => { setEditing(null); }} />
    </View>
  );
}

function openProSettings(): void {
  router.push('/settings/pro');
}

function PageBlockEditorSheet({ block, onClose }: { readonly block: PageBlock | null; readonly onClose: () => void }): ReactNode {
  if (block === null) return null;
  return <PageBlockEditorContent key={block.id} block={block} onClose={onClose} />;
}

function PageBlockEditorContent({ block, onClose }: { readonly block: PageBlock; readonly onClose: () => void }): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const updateBlock = usePageDesignStore((state) => state.updateBlock);
  const removeBlock = usePageDesignStore((state) => state.removeBlock);
  const moveBlock = usePageDesignStore((state) => state.moveBlock);
  const setBlockVisible = usePageDesignStore((state) => state.setBlockVisible);
  const appearance = usePageDesignStore((state) => state.design.appearance);
  // Order and visibility apply at once, so they read the live store, not the
  // snapshot the sheet opened with.
  const visible = usePageDesignStore((state) => state.design.blocks.find((candidate) => candidate.id === block.id)?.visible ?? block.visible);
  const position = usePageDesignStore((state) => state.design.blocks
    .filter((candidate) => candidate.type !== 'links')
    .findIndex((candidate) => candidate.id === block.id));
  const sectionCount = usePageDesignStore((state) => pageSectionCount(state.design.blocks));
  const record = useProfileStore((state) => state.record);
  const [title, setTitle] = useState(block.title);
  const [style, setStyle] = useState(block.style);
  const [size, setSize] = useState(cardSizeOf(block));
  const setBlockSize = usePageDesignStore((state) => state.setBlockSize);
  const [items, setItems] = useState<readonly PageBlockItem[]>(block.items);
  const catalog = PAGE_BLOCK_CATALOG.find((entry) => entry.type === block.type);
  if (!catalog) return null;
  const cleanedItems = items
    .filter((item) => item.title.trim().length > 0)
    .map((item) => ({
      ...item,
      title: item.title.trim(),
      ...(item.url?.trim() ? { url: item.url.trim() } : { url: undefined }),
      ...(item.price?.trim() ? { price: item.price.trim() } : { price: undefined }),
    }));
  // The card at the top is this draft painted exactly as the Page will.
  const draft: PageBlock = { ...block, title: title.trim() || block.title, style, size, items: cleanedItems };
  const canSave = title.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    updateBlock(block.id, { title, style, items: cleanedItems });
    setBlockSize(block.id, size);
    onClose();
  };
  return (
    <ModalSheet visible onRequestClose={onClose}>
      <View className="flex-1 bg-pageBg" style={{ paddingTop: sheetTopInset(insets.top) }}>
        {/* Cancel / title / Save, like iOS edit sheets: no stack of buttons. */}
        <View className="min-h-14 flex-row items-center justify-between border-b border-divider px-2">
          <SheetTextButton label={t('common.cancel')} onPress={onClose} />
          <ThemedText variant="titleMedium">{t('pageDesign.editSectionTitle')}</ThemedText>
          <SheetTextButton label={t('common.save')} strong disabled={!canSave} onPress={save} />
        </View>
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          bottomOffset={16}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 18 }}>
          {record !== null ? (
            <View className="gap-2">
              <View style={{ opacity: visible ? 1 : 0.45 }}>
                <PageBlockPreview block={draft} record={record} appearance={appearance} />
              </View>
              {cleanedItems.length === 0 && block.type !== 'leave-card' ? (
                <ThemedText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
                  {t('pageDesign.previewEmptyHint')}
                </ThemedText>
              ) : null}
            </View>
          ) : null}

          <ThemedSurface className="flex-row" style={{ paddingVertical: 4 }}>
            <SheetTool
              icon="arrow.up"
              label={t('pageDesign.moveUpShort')}
              accessibilityLabel={t('pageDesign.moveUp', { title: block.title })}
              disabled={position <= 0}
              onPress={() => { moveBlock(block.id, 'up'); }}
            />
            <SheetTool
              icon="arrow.down"
              label={t('pageDesign.moveDownShort')}
              accessibilityLabel={t('pageDesign.moveDown', { title: block.title })}
              disabled={position < 0 || position >= sectionCount - 1}
              onPress={() => { moveBlock(block.id, 'down'); }}
            />
            <SheetTool
              icon={visible ? 'eye.slash' : 'eye'}
              label={t(visible ? 'pageDesign.hideShort' : 'pageDesign.showShort')}
              accessibilityLabel={t(visible ? 'pageDesign.hideSection' : 'pageDesign.showSection', { title: block.title })}
              onPress={() => { setBlockVisible(block.id, !visible); }}
            />
            <SheetTool
              icon="trash"
              color={Colors.destructive}
              label={t('pageDesign.removeShort')}
              accessibilityLabel={t('pageDesign.removeSectionNamed', { title: block.title })}
              onPress={() => { removeBlock(block.id); onClose(); }}
            />
          </ThemedSurface>

          {catalog.styles.length > 1 ? (
            <View className="gap-2">
              <ThemedText variant="label" tone="tertiary">{t('pageDesign.style')}</ThemedText>
              <View className="flex-row flex-wrap gap-2">
                {catalog.styles.map((option) => (
                  <ThemedChoiceChip
                    key={option}
                    label={t(`pageDesign.style.${option}`)}
                    selected={style === option}
                    onPress={() => { setStyle(option); }}
                  />
                ))}
              </View>
            </View>
          ) : null}
          {blockHasCardSize(style) ? <CardSizePicker value={size} onChange={setSize} /> : null}
          <ThemedTextInput
            label={t('pageDesign.sectionTitle')}
            value={title}
            maxLength={MAX_PAGE_BLOCK_TITLE_LENGTH}
            onChangeText={setTitle}
            showClear
          />

          <View className="gap-2">
            <ThemedText variant="label" tone="tertiary">
              {`${t('pageDesign.items')} ${items.length}/${MAX_PAGE_ITEMS_PER_BLOCK}`}
            </ThemedText>
            {items.map((item) => (
              <ThemedSurface key={item.id} padded className="gap-3">
                <View className="flex-row items-end gap-1">
                  <View className="flex-1">
                    <ThemedTextInput
                      label={t('pageDesign.itemTitle')}
                      value={item.title}
                      maxLength={MAX_PAGE_ITEM_TITLE_LENGTH}
                      onChangeText={(nextTitle) => {
                        setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, title: nextTitle } : candidate));
                      }}
                      showClear
                    />
                  </View>
                  <PressableScale
                    haptic="tap"
                    onPress={() => { setItems((current) => current.filter((candidate) => candidate.id !== item.id)); }}
                    accessibilityRole="button"
                    accessibilityLabel={t('pageDesign.removeItem')}
                    style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                    <SfIcon name="trash" size={15} color={c.text2} />
                  </PressableScale>
                </View>
                <ThemedTextInput
                  kind="url"
                  label={t('pageDesign.itemUrl')}
                  value={item.url ?? ''}
                  onChangeText={(url) => {
                    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, url } : candidate));
                  }}
                  showClear
                />
                {block.type === 'shop' ? (
                  <ThemedTextInput
                    label={t('pageDesign.itemPrice')}
                    value={item.price ?? ''}
                    maxLength={MAX_PAGE_ITEM_PRICE_LENGTH}
                    onChangeText={(price) => {
                      setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, price } : candidate));
                    }}
                    showClear
                  />
                ) : null}
              </ThemedSurface>
            ))}
            {items.length < MAX_PAGE_ITEMS_PER_BLOCK ? (
              <ThemedButton
                label={t('pageDesign.addItem')}
                variant="dottedOutline"
                fullWidth
                onPress={() => { setItems((current) => [...current, { id: uuid(), title: '' }]); }}
              />
            ) : null}
          </View>
        </KeyboardAwareScrollView>
      </View>
    </ModalSheet>
  );
}

function SheetTextButton({
  label,
  strong = false,
  disabled = false,
  onPress,
}: {
  readonly label: string;
  readonly strong?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <PressableScale
      haptic="tap"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={{ minWidth: 64, height: 44, paddingHorizontal: 8, justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}>
      <ThemedText variant={strong ? 'titleMedium' : 'bodyLarge'} style={{ textAlign: 'center' }}>{label}</ThemedText>
    </PressableScale>
  );
}

/** One of the block's whole-section actions: icon over a short word. */
function SheetTool({
  icon,
  label,
  accessibilityLabel,
  color,
  disabled = false,
  onPress,
}: {
  readonly icon: SFSymbol;
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly color?: string;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const c = useThemeColors();
  const tint = color ?? c.text1;
  return (
    <PressableScale
      haptic="tap"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      containerStyle={{ flex: 1 }}
      style={{ minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: disabled ? 0.3 : 1 }}>
      <SfIcon name={icon} size={17} color={tint} />
      <ThemedText variant="caption" style={{ color: tint }}>{label}</ThemedText>
    </PressableScale>
  );
}
