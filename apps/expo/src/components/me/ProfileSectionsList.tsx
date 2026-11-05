import { useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalSheet, sheetTopInset } from '@/components/common/ModalSheet';
import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedButton, ThemedChoiceChip, ThemedSurface, ThemedText, ThemedTextInput } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { useThemeColors } from '@/constants/useThemeColors';
import { useTranslation } from '@/i18n';
import { haptic } from '@/feedback/haptics';
import { confirmDialog } from '@/feedback/confirmDialog';
import { isHttpsLinkUrl, normalizeLinkUrl } from '@/profile/linkUrl';
import {
  PAGE_BLOCK_CATALOG,
  MAX_PAGE_BLOCK_TITLE_LENGTH,
  MAX_PAGE_ITEM_PRICE_LENGTH,
  MAX_PAGE_ITEM_TITLE_LENGTH,
  MAX_PAGE_ITEMS_PER_BLOCK,
  MAX_PAGE_SECTIONS,
  blockHasCardSize,
  cardSizeOf,
  type PageBlock,
  type PageBlockItem,
  type PageBlockType,
} from '@/page/pageDesign';
import { preparePageDesign, usePageDesignStore } from '@/page/pageDesignStore';
import { useProGate } from '@/pro/useProGate';

import { CardSizePicker } from './CardSizePicker';
import { PHONE_SCREEN_RADIUS, PageBlockPreview, PageLivePreview, type PreviewBlockEditing } from './PageLivePreview';
import { PageCollapsibleHeader } from './PageCollapsibleHeader';
import { PublishChangesCard } from './PublishChangesCard';
import { usePagePublish } from './usePagePublish';
import { useProfileStore } from '@/profile/store';
import { isRenderableLinkUrl, uuid, type ProfileRecord } from '@solidarity/shared';

/** Blocks whose items show an image (`MediaTile` / thumbnails) — matches web `MEDIA_BLOCK_TYPES`. */
const MEDIA_BLOCK_TYPES: ReadonlySet<PageBlockType> = new Set(['portfolio', 'featured', 'video', 'shop']);

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
  const removeBlock = usePageDesignStore((state) => state.removeBlock);
  const { locked } = useProGate();
  const [editing, setEditing] = useState<PageBlock | null>(null);
  const pagePublish = usePagePublish(previewHandle);
  const movableBlocks = blocks.filter((block) => block.type !== 'links');

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
    onRemove: (block) => {
      void confirmDialog({
        title: t('pageDesign.removeSectionConfirmTitle', { title: block.title }),
        message: t('pageDesign.removeSectionConfirmBody'),
        confirmLabel: t('pageDesign.removeShort'),
        destructive: true,
      }).then((ok) => {
        if (!ok) return;
        removeBlock(block.id);
        haptic('success');
      });
    },
  };

  return (
    <View className="gap-3 px-4">
      <PageCollapsibleHeader
        title={t('mePage.sections')}
        summary={status === 'ready' ? `${movableBlocks.length}/${MAX_PAGE_SECTIONS}` : null}
        add={{
          label: t('pageDesign.addSection'),
          disabled: status !== 'ready' || movableBlocks.length >= MAX_PAGE_SECTIONS,
          onPress: onAddSection,
        }}
      />

      {/* Never folded: a section just added from ＋ must show up where it
          will live, not disappear into a closed group. */}
      {status === 'loading' ? (
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
              tapped block opens its editor, a long-pressed one drags to a new
              place and a swiped-left one asks to be removed; the links block
              stays first and is edited from the list above. */}
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
          {movableBlocks.length > 0 ? (
            <ThemedText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
              {t('pageDesign.gestureHint')}
            </ThemedText>
          ) : null}
        </>
      )}

      {pagePublish.showCard ? (
        <PublishChangesCard
          state={pagePublish.cardState}
          onPublish={pagePublish.publish}
          onDismiss={pagePublish.dismiss}
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
  const setBlockVisible = usePageDesignStore((state) => state.setBlockVisible);
  const appearance = usePageDesignStore((state) => state.design.appearance);
  // Visibility applies at once, so it reads the live store, not the snapshot
  // the sheet opened with. Hiding is gone from the editor; this only lets a
  // section hidden by an older version come back.
  const visible = usePageDesignStore((state) => state.design.blocks.find((candidate) => candidate.id === block.id)?.visible ?? block.visible);
  const record = useProfileStore((state) => state.record);
  const [title, setTitle] = useState(block.title);
  const [style, setStyle] = useState(block.style);
  const [size, setSize] = useState(cardSizeOf(block));
  const setBlockSize = usePageDesignStore((state) => state.setBlockSize);
  const [items, setItems] = useState<readonly PageBlockItem[]>(block.items);
  // A text section is just text: one box, each line one signed item (the
  // schema caps a line at 160 characters and a block at 24 items).
  const isText = block.type === 'text';
  const [text, setText] = useState(() => block.items.map((item) => item.title).join('\n'));
  const textLines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  const textError = textLines.length > MAX_PAGE_ITEMS_PER_BLOCK || textLines.some((line) => line.length > MAX_PAGE_ITEM_TITLE_LENGTH)
    ? t('pageDesign.textTooLong', { lines: MAX_PAGE_ITEMS_PER_BLOCK, chars: MAX_PAGE_ITEM_TITLE_LENGTH })
    : null;
  const catalog = PAGE_BLOCK_CATALOG.find((entry) => entry.type === block.type);
  if (!catalog) return null;
  // A bare `instagram.com/x` becomes https:// like the link sheet does; what
  // still isn't an https address is flagged on its field instead of being
  // signed into a Page the schema would refuse at publish time.
  const addressOf = (value: string | undefined): string | undefined => {
    const trimmed = value?.trim() ?? '';
    return trimmed.length > 0 ? normalizeLinkUrl(trimmed) : undefined;
  };
  const addressError = (value: string | undefined): string | null => {
    const address = addressOf(value);
    return address === undefined || (isHttpsLinkUrl(address) && isRenderableLinkUrl(address)) ? null : t('pageDesign.itemAddressInvalid');
  };
  const titleError = (item: PageBlockItem): string | null =>
    item.title.trim().length === 0 && [item.url, item.media, item.price].some((value) => (value?.trim() ?? '').length > 0)
      ? t('pageDesign.itemTitleRequired')
      : null;
  const itemsValid = isText ? textError === null : items.every((item) => titleError(item) === null && addressError(item.url) === null && addressError(item.media) === null);
  const cleanedItems = isText
    ? textLines.map((line, index) => ({ id: block.items[index]?.id ?? `${block.id}-t${String(index)}`, title: line }))
    : items
    .filter((item) => item.title.trim().length > 0)
    .map((item) => {
      const url = addressError(item.url) === null ? addressOf(item.url) : undefined;
      const media = addressError(item.media) === null ? addressOf(item.media) : undefined;
      return {
        ...item,
        title: item.title.trim(),
        url,
        ...(item.price?.trim() ? { price: item.price.trim() } : { price: undefined }),
        media,
      };
    });
  // A text block has no heading on the Page; its first line names it in the
  // section list and satisfies the schema's required title.
  const savedTitle = isText
    ? (textLines[0]?.slice(0, MAX_PAGE_BLOCK_TITLE_LENGTH) ?? block.title)
    : title;
  // The card at the top is this draft painted exactly as the Page will.
  const draft: PageBlock = { ...block, title: savedTitle.trim() || block.title, style, size, items: cleanedItems };
  const canSave = savedTitle.trim().length > 0 && itemsValid;
  const dirty = (!isText && title !== block.title) || style !== block.style || size !== cardSizeOf(block)
    || (isText
      ? text !== block.items.map((item) => item.title).join('\n')
      : JSON.stringify(items) !== JSON.stringify(block.items));
  const save = () => {
    if (!canSave) return;
    updateBlock(block.id, { title: savedTitle, style, items: cleanedItems });
    setBlockSize(block.id, size);
    onClose();
  };
  const cancel = () => {
    if (!dirty) {
      onClose();
      return;
    }
    void confirmDialog({
      title: t('meEdit.discardTitle'),
      message: t('meEdit.discardMessage'),
      confirmLabel: t('meEdit.discardAction'),
      cancelLabel: t('meEdit.keepEditing'),
      destructive: true,
    }).then((discard) => { if (discard) onClose(); });
  };
  return (
    <ModalSheet visible onRequestClose={cancel}>
      <View className="flex-1 bg-pageBg" style={{ paddingTop: sheetTopInset(insets.top) }}>
        {/* Cancel / title / Save, like iOS edit sheets: no stack of buttons. */}
        <View className="min-h-14 flex-row items-center justify-between border-b border-divider px-2">
          <SheetTextButton label={t('common.cancel')} onPress={cancel} />
          <ThemedText variant="titleMedium">{t('pageDesign.editSectionTitle')}</ThemedText>
          <SheetTextButton label={t('common.save')} strong disabled={!canSave} onPress={save} />
        </View>
        {/* The draft painted exactly as the Page will, pinned above the
            fields so every keystroke shows while the form scrolls. */}
        {record !== null ? (
          <View className="border-b border-divider" style={{ maxHeight: 280 }}>
            <ScrollView contentContainerStyle={{ padding: 12 }} showsVerticalScrollIndicator={false}>
              <View style={{ opacity: visible ? 1 : 0.45 }}>
                <PageBlockPreview
                  block={draft}
                  record={record}
                  appearance={appearance}
                  emptyHint={t('pageDesign.previewEmptyHint')}
                />
              </View>
            </ScrollView>
          </View>
        ) : null}
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          bottomOffset={16}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 18 }}>
          {visible ? null : (
            <ThemedButton
              label={t('pageDesign.showSection', { title: block.title })}
              icon="eye"
              variant="secondary"
              fullWidth
              onPress={() => { setBlockVisible(block.id, true); }}
            />
          )}

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
          {isText ? null : (
            <ThemedTextInput
              label={t('pageDesign.sectionTitle')}
              value={title}
              maxLength={MAX_PAGE_BLOCK_TITLE_LENGTH}
              onChangeText={setTitle}
              showClear
            />
          )}

          {isText ? (
            <ThemedTextInput
              accessibilityLabel={t('pageDesign.block.text')}
              value={text}
              onChangeText={setText}
              placeholder={t('pageDesign.textPlaceholder')}
              error={textError}
              multiline
            />
          ) : (
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
                      error={titleError(item)}
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
                  error={addressError(item.url)}
                  onChangeText={(url) => {
                    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, url } : candidate));
                  }}
                  showClear
                />
                {MEDIA_BLOCK_TYPES.has(block.type) ? (
                  <ThemedTextInput
                    kind="url"
                    label={t('pageDesign.itemMedia')}
                    value={item.media ?? ''}
                    error={addressError(item.media)}
                    onChangeText={(media) => {
                      setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, media } : candidate));
                    }}
                    showClear
                  />
                ) : null}
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
          )}
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
