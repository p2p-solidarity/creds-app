/**
 * Row-level pieces of the Verified Page preview, ported from the mock's
 * `.link-card`, `.shop`, `.fe-card`, `.vid` and `.pf`
 * (`creds-design/verified-linkinbio-mock-v3.html` §`#s-public`).
 *
 * `ItemPressable` is the single navigation boundary: only the visitor surface
 * opens URLs, and only after `isRenderableLinkUrl` re-checks a locally edited
 * draft that has not been through `parseProfile`.
 */
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { fadeUpIn } from '@/feedback/motion';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Linking, View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { BrandIcon } from '@/components/icons/BrandIcon';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedText } from '@/components/themed';
import { BrandBadge } from '@/components/icons/BrandBadge';
import { PageChromeColors, PageTemplateColors } from '@/constants/Colors';
import { MONO } from '@/constants/fonts';
import type { RichMedia } from '@/page/richMedia';
import { Radius } from '@/constants/radius';
import { appAlert } from '@/feedback/appAlert';
import { useTranslation } from '@/i18n';
import { linkDisplay } from '@/profile/linkPresentation';
import { isRenderableLinkUrl } from '@solidarity/shared';

import {
  paletteFor,
  previewCardStyle,
  type PageLivePreviewVariant,
  type PagePalette,
  type PreviewItem,
  type PreviewMetrics,
} from './pagePreviewTheme';

/** A facade drawn outside a Page (the add sheet) wears the default template. */
const DEFAULT_FACADE_PALETTE = paletteFor({
  template: 'cream',
  font: 'sans',
  background: 'cream',
  customBackground: null,
  showBrand: true,
  footerText: '',
});

export interface BlockRenderProps {
  readonly palette: PagePalette;
  readonly metrics: PreviewMetrics;
  readonly textColor: string;
  readonly fontFamily: string | undefined;
  readonly variant: PageLivePreviewVariant;
}

/** Opens a signed item's URL on the visitor surface; inert in the editor. */
export function ItemPressable({
  item,
  variant,
  fill = false,
  children,
}: {
  readonly item: PreviewItem;
  readonly variant: PageLivePreviewVariant;
  readonly fill?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const { t } = useTranslation();
  const url = variant === 'public' && item.url && isRenderableLinkUrl(item.url) ? item.url : null;
  if (!url) return <>{children}</>;
  return (
    <PressableScale
      haptic="tap"
      accessibilityRole="link"
      accessibilityLabel={item.title.trim() || linkDisplay(item.title, url).text}
      fill={fill}
      style={fill ? { flex: 1 } : undefined}
      onPress={() => {
        void Linking.openURL(url).catch(() => {
          appAlert({
            title: t('mePage.linkErrorTitle'),
            message: t('mePage.linkErrorMessage'),
          });
        });
      }}>
      {children}
    </PressableScale>
  );
}

/** The item's secondary line — a shop price, when the item carries one. */
function ItemPrice({
  item,
  palette,
  fontFamily,
}: {
  readonly item: PreviewItem;
  readonly palette: PagePalette;
  readonly fontFamily: string | undefined;
}): ReactNode {
  if (!item.price) return null;
  return (
    <ThemedText
      variant="caption"
      numberOfLines={1}
      style={{ color: palette.subtle, opacity: palette.subtleOpacity, fontFamily }}>
      {item.price}
    </ThemedText>
  );
}

/** `.pf` — a square media tile. Without artwork it stays a flat, labelled
 *  slot: the item is real, only its image is missing. */
export function MediaTile({
  item,
  palette,
  textColor,
  fontFamily,
  variant,
  hideLabel = false,
}: BlockRenderProps & { readonly item: PreviewItem; readonly hideLabel?: boolean }): ReactNode {
  const mediaUrl = item.media && isRenderableLinkUrl(item.media) ? item.media : null;
  return (
    <ItemPressable item={item} variant={variant} fill>
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          overflow: 'hidden',
          padding: 8,
          borderRadius: palette.cardRadius,
          backgroundColor: palette.placeholder,
        }}>
        {mediaUrl ? (
          <Image
            source={{ uri: mediaUrl }}
            contentFit="cover"
            accessibilityLabel={item.title}
            style={{ position: 'absolute', width: '100%', height: '100%' }}
          />
        ) : null}
        {hideLabel || mediaUrl ? null : (
          <ThemedText variant="caption" numberOfLines={2} style={{ color: textColor, fontFamily }}>
            {item.title}
          </ThemedText>
        )}
      </View>
    </ItemPressable>
  );
}

/** `.link-card` — icon well, bold title, mono URL: web `LinkRow`. */
export function LinkCard({
  item,
  ...render
}: BlockRenderProps & { readonly item: PreviewItem }): ReactNode {
  const { t } = useTranslation();
  const { palette, metrics, textColor, fontFamily, variant } = render;
  const mediaUrl = item.media && isRenderableLinkUrl(item.media) ? item.media : null;
  const reduceMotion = useReducedMotion();
  const shown = item.url ? linkDisplay(item.title, item.url) : null;
  return (
    <ItemPressable item={item} variant={variant}>
      <Animated.View entering={fadeUpIn(0, reduceMotion)} style={[previewCardStyle(palette, metrics), { minHeight: 44 }]}>
        <View
          style={{
            width: metrics.linkIcon,
            height: metrics.linkIcon,
            borderRadius: Radius.field,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.iconBg,
          }}>
          {mediaUrl ? (
            <Image
              source={{ uri: mediaUrl }}
              contentFit="cover"
              accessibilityLabel={item.title}
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <BrandIcon
              name={linkDisplay(item.title, item.url ?? '').brand}
              size={metrics.linkIcon >= 44 ? 22 : 18}
              color={palette.iconTint}
            />
          )}
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <ThemedText
            variant="titleMedium"
            numberOfLines={1}
            style={{ color: textColor, fontFamily, flexShrink: 1 }}>
            {item.title.trim() || t('pageDesign.untitledLink')}
          </ThemedText>
          {shown ? (
            <ThemedText
              variant="caption"
              numberOfLines={1}
              style={{ color: palette.subtle, opacity: palette.subtleOpacity, fontFamily: MONO, fontSize: 12 }}>
              {shown.text}
            </ThemedText>
          ) : null}
        </View>
      </Animated.View>
    </ItemPressable>
  );
}

/**
 * The web's click-to-load player facades (`RichBlocks`): a Spotify row with
 * the play disc, or a 16:9 plate for YouTube. Nothing third-party loads here
 * either — the visitor page swaps the real player in on a tap.
 */
export function PagePreviewMediaFacade({
  media,
  title,
  palette = DEFAULT_FACADE_PALETTE,
  fontFamily,
}: {
  readonly media: RichMedia;
  readonly title: string;
  readonly palette?: PagePalette;
  readonly fontFamily?: string | undefined;
}): ReactNode {
  const { t } = useTranslation();
  if (media.kind === 'spotify') {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 12,
          borderWidth: 1,
          borderColor: palette.cardBorder,
          borderRadius: palette.cardRadius,
          backgroundColor: palette.cardBg,
        }}>
        <BrandBadge name="spotify" size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText variant="titleMedium" numberOfLines={1} style={{ color: palette.text, fontFamily }}>
            {title}
          </ThemedText>
          <ThemedText variant="caption" numberOfLines={1} style={{ color: palette.subtle, fontFamily }}>
            {t(`pageAdd.music.spotify.${media.type}`)} · {t('pageDesign.loadsFrom', { host: 'Spotify' })}
          </ThemedText>
        </View>
        <PlayDisc size={36} />
      </View>
    );
  }
  return (
    <View
      style={{
        aspectRatio: 16 / 9,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: palette.cardRadius,
        backgroundColor: PageChromeColors.playerPlate,
      }}>
      <PlayDisc size={52} />
      <View style={{ position: 'absolute', left: 12, right: 12, bottom: 10, gap: 2 }}>
        <ThemedText variant="bodyMedium" numberOfLines={1} style={{ color: PageChromeColors.playerInk, fontFamily }}>
          {title}
        </ThemedText>
        <ThemedText variant="caption" numberOfLines={1} style={{ color: PageChromeColors.playerInk, opacity: 0.72 }}>
          {t('pageDesign.loadsFrom', { host: 'YouTube' })}
        </ThemedText>
      </View>
    </View>
  );
}

function PlayDisc({ size }: { readonly size: number }): ReactNode {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: PageChromeColors.playerScrim,
      }}>
      <SfIcon name="play.fill" size={Math.round(size * 0.4)} color={PageChromeColors.playerInk} />
    </View>
  );
}

/** `.shop` — thumbnail, title + price, and a buy capsule. */
export function ShopRow({
  item,
  ...render
}: BlockRenderProps & { readonly item: PreviewItem }): ReactNode {
  const { t } = useTranslation();
  const { palette, metrics, fontFamily, textColor, variant } = render;
  return (
    <ItemPressable item={item} variant={variant}>
      <View style={previewCardStyle(palette, metrics)}>
        <View style={{ width: 54, height: 54 }}>
          <MediaTile item={item} {...render} hideLabel />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <ThemedText variant="bodyMedium" numberOfLines={2} style={{ color: textColor, fontFamily }}>
            {item.title}
          </ThemedText>
          <ItemPrice item={item} palette={palette} fontFamily={fontFamily} />
        </View>
        {item.url && isRenderableLinkUrl(item.url) ? (
          <View
            style={{
              minHeight: 32,
              justifyContent: 'center',
              paddingHorizontal: 16,
              borderRadius: Radius.pill,
              backgroundColor: PageTemplateColors.invertedButtonBg,
            }}>
            <ThemedText variant="caption" style={{ color: PageTemplateColors.invertedButtonText, fontFamily }}>
              {t('pageDesign.previewBuy')}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </ItemPressable>
  );
}

/** `.fe-card` — square thumbnail beside a two-line main column. */
export function FeatureRow({
  item,
  thumbSize,
  ...render
}: BlockRenderProps & { readonly item: PreviewItem; readonly thumbSize: number }): ReactNode {
  const { palette, metrics, textColor, fontFamily, variant } = render;
  return (
    <ItemPressable item={item} variant={variant}>
      <View style={previewCardStyle(palette, metrics)}>
        <View style={{ width: thumbSize, height: thumbSize }}>
          <MediaTile item={item} {...render} hideLabel />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText variant="bodyMedium" numberOfLines={2} style={{ color: textColor, fontFamily }}>
            {item.title}
          </ThemedText>
          <ItemPrice item={item} palette={palette} fontFamily={fontFamily} />
        </View>
      </View>
    </ItemPressable>
  );
}

/** `.vid` — 16:9 dark plate carrying the play glyph over the item title. */
export function EmbedPlate({
  item,
  palette,
  fontFamily,
  variant,
}: Omit<BlockRenderProps, 'textColor' | 'metrics'> & { readonly item: PreviewItem }): ReactNode {
  const mediaUrl = item.media && isRenderableLinkUrl(item.media) ? item.media : null;
  return (
    <ItemPressable item={item} variant={variant}>
      <View
        style={{
          aspectRatio: 16 / 9,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: 12,
          overflow: 'hidden',
          borderRadius: palette.cardRadius,
          backgroundColor: PageTemplateColors.pageInk,
        }}>
        {mediaUrl ? (
          <Image
            source={{ uri: mediaUrl }}
            contentFit="cover"
            accessibilityLabel={item.title}
            style={{ position: 'absolute', width: '100%', height: '100%' }}
          />
        ) : null}
        <SfIcon name="play.rectangle.fill" size={28} color={PageTemplateColors.pageLightText} />
        <ThemedText
          variant="caption"
          numberOfLines={1}
          style={{ color: PageTemplateColors.pageLightText, fontFamily, textAlign: 'center' }}>
          {item.title}
        </ThemedText>
      </View>
    </ItemPressable>
  );
}

/** A pill row (`leave-card`'s button style) and the booking `.bkslot` chips. */
export function ItemCapsule({
  item,
  palette,
  fontFamily,
  variant,
  filled,
}: Omit<BlockRenderProps, 'textColor' | 'metrics'> & {
  readonly item: PreviewItem;
  readonly filled: boolean;
}): ReactNode {
  return (
    <ItemPressable item={item} variant={variant}>
      <View
        style={filled ? {
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 22,
          borderRadius: Radius.pill,
          backgroundColor: PageTemplateColors.invertedButtonBg,
        } : {
          minHeight: 34,
          justifyContent: 'center',
          paddingHorizontal: 14,
          borderRadius: Radius.pill,
          borderWidth: 1,
          borderColor: palette.cardBorder,
          backgroundColor: palette.cardBg,
        }}>
        <ThemedText
          variant={filled ? 'bodyLarge' : 'bodySmall'}
          numberOfLines={1}
          style={{ color: filled ? PageTemplateColors.invertedButtonText : palette.text, fontFamily }}>
          {item.title}
        </ThemedText>
      </View>
    </ItemPressable>
  );
}
