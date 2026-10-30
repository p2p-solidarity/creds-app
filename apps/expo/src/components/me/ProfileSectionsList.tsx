import { useEffect, useRef, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalSheet, sheetTopInset } from '@/components/common/ModalSheet';
import { ThemedButton, ThemedChoiceChip, ThemedSurface, ThemedText, ThemedTextInput } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { useThemeColors } from '@/constants/useThemeColors';
import { useTranslation } from '@/i18n';
import { confirmDialog } from '@/feedback/confirmDialog';
import { haptic } from '@/feedback/haptics';
import {
  PAGE_BLOCK_CATALOG,
  MAX_PAGE_BLOCK_TITLE_LENGTH,
  MAX_PAGE_ITEM_PRICE_LENGTH,
  MAX_PAGE_ITEM_TITLE_LENGTH,
  MAX_PAGE_ITEMS_PER_BLOCK,
  createInitialPageDesign,
  publicPageDesignEquals,
  toPublicPageDesign,
  type PageBlock,
  type PageBlockItem,
} from '@/page/pageDesign';
import { preparePageDesign, usePageDesignStore } from '@/page/pageDesignStore';
import { useProGate } from '@/pro/useProGate';

import { PHONE_SCREEN_RADIUS, PageBlockPreview, PageLivePreview } from './PageLivePreview';
import type { PreviewBlockEditing } from './PagePreviewBlockFrame';
import { PageCollapsibleHeader } from './PageCollapsibleHeader';
import { PublishChangesCard } from './PublishChangesCard';
import { useProfileStore } from '@/profile/store';
import { uuid, type ProfileRecord } from '@solidarity/shared';

export interface ProfileSectionsListProps {
  /** Opens the tab's ＋ 新增 sheet, where new sections come from. */
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
  const setBlockVisible = usePageDesignStore((state) => state.setBlockVisible);
  const moveBlock = usePageDesignStore((state) => state.moveBlock);
  const removeBlock = usePageDesignStore((state) => state.removeBlock);
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
    onMove: (block, direction) => {
      if (proLocked(block)) openProSettings();
      else moveBlock(block.id, direction);
    },
    onToggleVisible: (block) => {
      if (proLocked(block)) openProSettings();
      else setBlockVisible(block.id, !block.visible);
    },
    onRemove: (block) => {
      void confirmDialog({
        title: t('pageDesign.removeSectionConfirmTitle', { title: block.title }),
        message: t('pageDesign.removeSectionConfirmBody'),
        confirmLabel: t('pageDesign.removeSection'),
        destructive: true,
      }).then((confirmed) => {
        if (confirmed) removeBlock(block.id);
      });
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
        summary={status === 'ready' ? t('mePage.groupCount', { count: movableBlocks.length + 1 }) : null}
        open={open}
        onToggle={() => { setOpen((current) => !current); }}
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
          {/* The page itself is the editor: blocks are tapped, moved, hidden
              and removed where they appear; the links block stays first and
              is edited from the links list above. */}
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
          <ThemedButton
            label={t('pageDesign.addSection')}
            icon="plus"
            variant="secondary"
            fullWidth
            onPress={onAddSection}
          />
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
  const insets = useSafeAreaInsets();
  const updateBlock = usePageDesignStore((state) => state.updateBlock);
  const removeBlock = usePageDesignStore((state) => state.removeBlock);
  const appearance = usePageDesignStore((state) => state.design.appearance);
  const record = useProfileStore((state) => state.record);
  const [title, setTitle] = useState(block.title);
  const [style, setStyle] = useState(block.style);
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
  const draft: PageBlock = { ...block, title: title.trim() || block.title, style, items: cleanedItems };
  const save = () => {
    updateBlock(block.id, { title, style, items: cleanedItems });
    onClose();
  };
  return (
    <ModalSheet visible onRequestClose={onClose}>
      <View className="flex-1 bg-pageBg" style={{ paddingTop: sheetTopInset(insets.top) }}>
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          bottomOffset={16}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 18 }}>
          <ThemedText variant="titleLarge">{t('pageDesign.editSectionTitle')}</ThemedText>
          {record !== null ? (
            <View className="gap-2">
              <PageBlockPreview block={draft} record={record} appearance={appearance} />
              {cleanedItems.length === 0 && block.type !== 'leave-card' ? (
                <ThemedText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
                  {t('pageDesign.previewEmptyHint')}
                </ThemedText>
              ) : null}
            </View>
          ) : null}
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
          <ThemedTextInput
            label={t('pageDesign.sectionTitle')}
            value={title}
            maxLength={MAX_PAGE_BLOCK_TITLE_LENGTH}
            onChangeText={setTitle}
            showClear
          />

          <View className="gap-2">
            <ThemedText variant="label" tone="tertiary">{t('pageDesign.items')}</ThemedText>
            {items.map((item) => (
              <ThemedSurface key={item.id} padded className="gap-3">
                <ThemedTextInput
                  label={t('pageDesign.itemTitle')}
                  value={item.title}
                  maxLength={MAX_PAGE_ITEM_TITLE_LENGTH}
                  onChangeText={(nextTitle) => {
                    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, title: nextTitle } : candidate));
                  }}
                  showClear
                />
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
                <ThemedButton
                  label={t('pageDesign.removeItem')}
                  variant="destructive"
                  size="sm"
                  onPress={() => { setItems((current) => current.filter((candidate) => candidate.id !== item.id)); }}
                />
              </ThemedSurface>
            ))}
            <ThemedButton
              label={t('pageDesign.addItem')}
              variant="secondary"
              fullWidth
              disabled={items.length >= MAX_PAGE_ITEMS_PER_BLOCK}
              onPress={() => { setItems((current) => [...current, { id: uuid(), title: '' }]); }}
            />
          </View>

          <ThemedButton label={t('common.save')} fullWidth disabled={!title.trim()} onPress={save} />
          <ThemedButton
            label={t('pageDesign.removeSection')}
            variant="destructive"
            fullWidth
            onPress={() => { removeBlock(block.id); onClose(); }}
          />
          <ThemedButton label={t('common.cancel')} variant="secondary" fullWidth onPress={onClose} />
        </KeyboardAwareScrollView>
      </View>
    </ModalSheet>
  );
}
