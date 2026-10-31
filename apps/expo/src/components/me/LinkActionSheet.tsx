/**
 * The ⋯ sheet of one Page link: the link's own card on top, painted exactly as
 * the Page shows it (a Spotify link becomes its player), the 小 / 中 / 大 card
 * size beneath it, then the actions. Size belongs to the links block, so it
 * resizes every link card on the Page — the caption says so.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'expo-symbols';

import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedSurface, ThemedText } from '@/components/themed';
import { useThemeColors } from '@/constants/useThemeColors';
import { useTranslation } from '@/i18n';
import { cardSizeOf } from '@/page/pageDesign';
import { usePageDesignStore } from '@/page/pageDesignStore';
import { linkDisplay } from '@/profile/linkPresentation';
import type { ProfileLink } from '@solidarity/shared';

import { CardSizePicker } from './CardSizePicker';
import { PageItemsPreview } from './PageLivePreview';
import { SlideUpSheet } from './SlideUpSheet';

export interface LinkSheetAction {
  readonly icon: SFSymbol;
  readonly label: string;
  readonly onPress: () => void;
}

export function LinkActionSheet({
  link,
  actions,
  onClose,
}: {
  /** `null` = closed. */
  readonly link: ProfileLink | null;
  readonly actions: readonly LinkSheetAction[];
  readonly onClose: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const linksBlock = usePageDesignStore((state) => state.design.blocks.find((block) => block.type === 'links'));
  const appearance = usePageDesignStore((state) => state.design.appearance);
  const setBlockSize = usePageDesignStore((state) => state.setBlockSize);
  return (
    <SlideUpSheet visible={link !== null} onClose={onClose} dismissOnBackdrop>
      {(close) => link === null ? null : (
        <ThemedSurface
          variant="elevated"
          className="gap-4 rounded-t-sheet px-4 pt-2"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
          <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: c.divider }} />
          <ThemedText variant="titleMedium" numberOfLines={1} ellipsizeMode="middle">
            {linkDisplay(link.label, link.url).text}
          </ThemedText>
          {linksBlock !== undefined ? (
            <>
              <View style={{ borderRadius: 14, overflow: 'hidden' }}>
                <PageItemsPreview
                  block={linksBlock}
                  items={[{ id: link.url, title: link.label, url: link.url }]}
                  appearance={appearance}
                />
              </View>
              <View className="gap-1">
                <CardSizePicker
                  value={cardSizeOf(linksBlock)}
                  onChange={(size) => { setBlockSize(linksBlock.id, size); }}
                />
                <ThemedText variant="caption" tone="tertiary">{t('pageDesign.cardSizeAllLinks')}</ThemedText>
              </View>
            </>
          ) : null}
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: c.divider,
              backgroundColor: c.cardBg,
              overflow: 'hidden',
            }}>
            {actions.map((action, index) => (
              <PressableScale
                key={action.label}
                haptic="tap"
                onPress={() => { close(action.onPress); }}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                style={{
                  minHeight: 52,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 16,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: c.divider,
                }}>
                <SfIcon name={action.icon} size={17} color={c.primaryBlue} />
                <ThemedText variant="bodyLarge" style={{ flex: 1 }}>{action.label}</ThemedText>
                <SfIcon name="chevron.right" size={13} color={c.text3} />
              </PressableScale>
            ))}
          </View>
        </ThemedSurface>
      )}
    </SlideUpSheet>
  );
}
