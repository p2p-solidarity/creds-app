/**
 * Header, empty notice, and footer of the Verified Page preview — the mock's
 * `.pub-avatar` / `.pub-name` / `.pub-handle` / `.pub-bio`, `.pub-empty`, and
 * `.pub-foot` (`creds-design/verified-linkinbio-mock-v3.html` §`#s-public`).
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { BrandIcon } from '@/components/icons/BrandIcon';
import type { BrandIconName } from '@/components/icons/brandGlyphs';
import { ThemedText } from '@/components/themed';
import { PageChromeColors, PagePalettes } from '@/constants/Colors';
import { useTranslation } from '@/i18n';
import type { PageAppearance } from '@/page/pageDesign';
import { resolveProfileAvatarSource } from '@/profile/avatar';
import { publicHttpsUrl } from '@/profile/httpsOwnership';
import { brandIconForLink } from '@/profile/linkPresentation';
import type { ProfileRecord } from '@solidarity/shared';

import type { PageLivePreviewVariant, PagePalette, PreviewMetrics } from './pagePreviewTheme';
import { MONO } from '@/constants/fonts';
import { Radius, shadow } from '@/constants/radius';

export interface PagePreviewChromeProps {
  readonly palette: PagePalette;
  readonly metrics: PreviewMetrics;
  readonly fontFamily: string | undefined;
  readonly variant: PageLivePreviewVariant;
}

export function PagePreviewHeader({
  record,
  handle,
  palette,
  metrics,
  fontFamily,
  variant,
}: PagePreviewChromeProps & {
  readonly record: ProfileRecord;
  readonly handle: string | null;
}): ReactNode {
  const { t } = useTranslation();
  // Someone else's Page: their avatar URL is fetched by this phone, so it
  // passes the same https-only / no-private-IP guard as link checks.
  const avatarUrl = variant === 'public'
    ? (record.avatar === null ? null : publicHttpsUrl(record.avatar)?.toString() ?? null)
    : resolveProfileAvatarSource(record.avatar, null);
  const trimmedHandle = handle?.trim() ?? '';
  const headline = variant === 'public' ? 'headlineLarge' : 'headlineMedium';
  const marks = cardMarks(record.links);

  return (
    <View style={{ alignItems: 'center' }}>
      {/* `.pub-avatar`: warm-cream → gradient-cream disc, a card-coloured ring.
          The shadow sits on a wrapper: on iOS a shadow on the clipping gradient
          paints its square bounds behind the disc. */}
      <View style={{ borderRadius: Radius.pill, ...shadow('avatar') }}>
        <LinearGradient
          colors={PageChromeColors.avatarStops}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: metrics.avatar,
            height: metrics.avatar,
            borderRadius: metrics.avatar / 2,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 3,
            borderColor: palette.cardBg,
          }}>
          <ThemedText variant={headline} style={{ color: PagePalettes.cream.accent, fontFamily }}>
            {(record.displayName.trim().charAt(0) || '?').toUpperCase()}
          </ThemedText>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              contentFit="cover"
              accessibilityLabel={record.displayName}
              cachePolicy="memory-disk"
              style={{ position: 'absolute', width: '100%', height: '100%' }}
            />
          ) : null}
        </LinearGradient>
      </View>

      <ThemedText
        variant={headline}
        style={{
          color: palette.text,
          fontFamily,
          marginTop: metrics.headerGap,
          textAlign: 'center',
        }}>
        {record.displayName || t('mePage.unnamed')}
      </ThemedText>

      {trimmedHandle.length > 0 ? (
        <ThemedText
          variant="caption"
          numberOfLines={1}
          style={{
            color: palette.subtle,
            opacity: palette.subtleOpacity,
            fontFamily: MONO,
            marginTop: 2,
            textAlign: 'center',
          }}>
          {trimmedHandle}
        </ThemedText>
      ) : null}

      {record.bio ? (
        <ThemedText
          variant="bodyMedium"
          style={{
            color: palette.text,
            fontFamily,
            marginTop: metrics.bioGap,
            textAlign: 'center',
          }}>
          {record.bio}
        </ThemedText>
      ) : null}

      {/* The platforms the page links to, one mark each — web `cardMarks`. */}
      {marks.length > 0 ? (
        <View
          accessibilityRole="none"
          style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginTop: metrics.bioGap }}>
          {marks.map((mark) => (
            <BrandIcon key={mark} name={mark} size={variant === 'public' ? 24 : 20} color={palette.text} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** One mark per platform the links name, in page order, at most 8. */
function cardMarks(links: ProfileRecord['links']): readonly BrandIconName[] {
  const seen = new Set<BrandIconName>();
  for (const link of links) {
    if (link.url.trim() === '') continue;
    seen.add(brandIconForLink(link.label, link.url));
  }
  return [...seen].slice(0, 8);
}

/** `.pub-empty` — one quiet sentence. Deliberately no illustration and no
 *  call to action: an empty page is a normal state, not a failure. */
export function PagePreviewEmpty({ palette, metrics, fontFamily }: PagePreviewChromeProps): ReactNode {
  const { t } = useTranslation();
  return (
    <ThemedText
      variant="bodyMedium"
      style={{
        color: palette.subtle,
        opacity: palette.subtleOpacity,
        fontFamily,
        marginTop: metrics.sectionGap,
        textAlign: 'center',
      }}>
      {t('pageDesign.previewEmpty')}
    </ThemedText>
  );
}

/** `.pub-foot` — `creds.id · footer text`, far below the last card. */
export function PagePreviewFooter({
  appearance,
  palette,
  metrics,
  fontFamily,
}: PagePreviewChromeProps & { readonly appearance: PageAppearance }): ReactNode {
  if (!appearance.footerText && !appearance.showBrand) return null;
  const quiet = { color: palette.quiet, fontSize: 12 } as const;
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 7,
        marginTop: metrics.footerGap,
      }}>
      {appearance.showBrand ? (
        <ThemedText variant="caption" style={[quiet, { fontFamily: MONO, fontWeight: '700' }]}>creds.id</ThemedText>
      ) : null}
      {appearance.showBrand && appearance.footerText ? (
        <ThemedText variant="caption" style={quiet}>·</ThemedText>
      ) : null}
      {appearance.footerText ? (
        <ThemedText variant="caption" style={[quiet, { fontFamily }]}>{appearance.footerText}</ThemedText>
      ) : null}
    </View>
  );
}

/** `.pf-title` — the block heading above every non-links section. */
export function PagePreviewSectionTitle({
  title,
  palette,
  fontFamily,
}: Omit<PagePreviewChromeProps, 'metrics' | 'variant'> & { readonly title: string }): ReactNode {
  return (
    <ThemedText
      variant="label"
      accessibilityRole="header"
      style={{
        color: palette.subtle,
        opacity: palette.subtleOpacity,
        fontFamily,
        letterSpacing: 0.5,
        marginBottom: 10,
      }}>
      {title}
    </ThemedText>
  );
}
