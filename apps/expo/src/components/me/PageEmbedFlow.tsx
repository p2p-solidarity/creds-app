/**
 * PageEmbedFlow — the add sheet's 音樂 and 表單 steps. Both become ordinary
 * signed Page blocks, so creds.id renders them with no schema change:
 *
 *   music  a Spotify track / album / playlist / artist → a `featured` block;
 *          a YouTube video or channel → a `video` block. The web plays both
 *          (`RichBlocks.richMediaFor`), loading the player only on a tap.
 *   form   a link to the owner's own form service (Google Forms, Tally,
 *          Typeform…) → a `featured` list block, i.e. a titled section with
 *          one button-like row. Answers go to that service; creds.id runs no
 *          form backend and never sees them.
 *
 * Adding only changes the local Page draft; the Page tab's publish card
 * signs it, exactly like a section added from the block list.
 */
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandBadge } from '@/components/icons/BrandBadge';
import { ThemedButton, ThemedText, ThemedTextInput } from '@/components/themed';
import { haptic } from '@/feedback/haptics';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import {
  MAX_PAGE_BLOCK_COUNT,
  MAX_PAGE_BLOCK_TITLE_LENGTH,
  MAX_PAGE_ITEM_TITLE_LENGTH,
} from '@/page/pageDesign';
import { usePageDesignStore } from '@/page/pageDesignStore';
import { classifyMediaUrl, type RichMedia } from '@/page/richMedia';
import { isHttpsLinkUrl, normalizeLinkUrl } from '@/profile/linkUrl';
import { uuid } from '@solidarity/shared';

import { SheetHeader } from './AddLinkSheet';
import { PagePreviewMediaFacade } from './PagePreviewItems';

export type EmbedKind = 'music' | 'form';

export interface PageEmbedFlowProps {
  readonly kind: EmbedKind;
  readonly initialUrl?: string | null;
  readonly onBack: () => void;
  readonly onDone: () => void;
}

function mediaDefaultTitle(media: RichMedia, t: (key: string) => string): string {
  if (media.kind === 'spotify') return t(`pageAdd.music.spotify.${media.type}`);
  return t(media.kind === 'youtube-channel' ? 'pageAdd.music.youtubeChannel' : 'pageAdd.music.youtubeVideo');
}

export function PageEmbedFlow({ kind, initialUrl = null, onBack, onDone }: PageEmbedFlowProps): ReactNode {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const status = usePageDesignStore((state) => state.status);
  const blockCount = usePageDesignStore((state) => state.design.blocks.length);
  const addBlock = usePageDesignStore((state) => state.addBlock);
  const updateBlock = usePageDesignStore((state) => state.updateBlock);
  const [input, setInput] = useState(initialUrl ?? '');
  const [title, setTitle] = useState('');
  const [sectionTitle, setSectionTitle] = useState('');

  const url = normalizeLinkUrl(input);
  const validUrl = isHttpsLinkUrl(url) && new URL(url).hostname.includes('.');
  const media = validUrl ? classifyMediaUrl(url) : null;
  const typed = input.trim().length > 0;
  const urlError = !typed
    ? null
    : kind === 'music'
      ? media === null ? t('pageAdd.music.unsupported') : null
      : !validUrl ? t('profileLink.httpsOnly') : media !== null ? t('pageAdd.form.isMedia') : null;
  const full = blockCount >= MAX_PAGE_BLOCK_COUNT;
  const blocked = status !== 'ready'
    ? t(status === 'loading' ? 'pageDesign.loading' : 'pageDesign.loadError')
    : full ? t('pageAdd.sectionsFull', { count: MAX_PAGE_BLOCK_COUNT }) : null;
  const ready = typed && urlError === null && blocked === null;

  const itemTitle = title.trim()
    || (kind === 'music' && media !== null ? mediaDefaultTitle(media, t) : t('pageAdd.form.defaultButton'));
  const blockTitle = sectionTitle.trim()
    || t(kind === 'form' ? 'pageAdd.form.defaultTitle' : media?.kind === 'spotify' ? 'pageAdd.music.blockTitle' : 'pageAdd.music.videoBlockTitle');

  const add = () => {
    if (!ready) return;
    const type = kind === 'music' && media?.kind !== 'spotify' ? 'video' : 'featured';
    const id = addBlock(type, blockTitle);
    if (id === null) {
      pushToast(t('pageDesign.loadError'), 'error');
      return;
    }
    updateBlock(id, {
      // A form is a row to tap, not a card with artwork.
      ...(kind === 'form' ? { style: 'list' } : {}),
      items: [{ id: uuid(), title: itemTitle, url }],
    });
    haptic('success');
    pushToast(t('pageAdd.addedToDraft'), 'success');
    onDone();
  };

  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <SheetHeader title={t(kind === 'music' ? 'pageAdd.music.title' : 'pageAdd.form.title')} canGoBack onBack={onBack} onClose={onDone} />
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={16}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 18 }}>
        <ThemedText variant="bodySmall" tone="secondary">
          {t(kind === 'music' ? 'pageAdd.music.intro' : 'pageAdd.form.intro')}
        </ThemedText>
        <ThemedTextInput
          kind="url"
          value={input}
          onChangeText={setInput}
          leading={
            kind === 'music' && media !== null
              ? <BrandBadge name={media.kind === 'spotify' ? 'spotify' : 'youtube'} size={26} />
              : kind === 'form' && validUrl && media === null ? <BrandBadge name="form" size={26} /> : undefined
          }
          icon={kind === 'music' ? 'music.note' : 'list.bullet.clipboard'}
          placeholder={t(kind === 'music' ? 'pageAdd.music.placeholder' : 'pageAdd.form.placeholder')}
          error={urlError}
          autoFocus={initialUrl === null}
          showPaste
          showClear
          returnKeyType="done"
        />
        {kind === 'form' ? (
          <ThemedTextInput
            label={t('pageAdd.form.sectionTitle')}
            value={sectionTitle}
            onChangeText={setSectionTitle}
            placeholder={t('pageAdd.form.defaultTitle')}
            maxLength={MAX_PAGE_BLOCK_TITLE_LENGTH}
            showClear
          />
        ) : null}
        <ThemedTextInput
          label={t(kind === 'music' ? 'pageAdd.music.itemTitle' : 'pageAdd.form.buttonLabel')}
          value={title}
          onChangeText={setTitle}
          placeholder={itemTitle}
          maxLength={MAX_PAGE_ITEM_TITLE_LENGTH}
          showClear
        />
        {kind === 'music' && media !== null ? (
          <PagePreviewMediaFacade media={media} title={itemTitle} />
        ) : null}
        {blocked !== null ? (
          <ThemedText variant="caption" tone="tertiary">{blocked}</ThemedText>
        ) : null}
        <ThemedButton label={t('pageAdd.addToPage')} icon="plus" fullWidth disabled={!ready} onPress={add} />
        {kind === 'form' ? (
          <ThemedText variant="caption" tone="tertiary">{t('pageAdd.form.privacy')}</ThemedText>
        ) : null}
      </KeyboardAwareScrollView>
    </View>
  );
}
