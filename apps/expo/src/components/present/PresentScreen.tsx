/**
 * Present tab — one card (10 §4): the metal card, the QR plate in its
 * online or offline form, and the public links that QR hands over. Scanning
 * someone else lives in the header.
 */
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LinkIcon } from '@/components/icons/LinkIcon';
import type { PublicPageShareSource } from '@/components/me/meProfileModel';
import { MeProfileGate } from '@/components/me/MeProfileGate';
import { PageHeaderAction } from '@/components/me/PageHeaderAction';
import { PageSectionLabel } from '@/components/me/PageSectionLabel';
import { PresentCard } from '@/components/present/PresentCard';
import { ThemedSurface, ThemedText } from '@/components/themed';
import { Radius } from '@/constants/radius';
import { useThemeColors } from '@/constants/useThemeColors';
import { fadeUpIn } from '@/feedback/motion';
import { useTranslation } from '@/i18n';
import { presentPublicLinks, type PresentPublicLink } from '@/present/presentModel';
import { linkDisplay, linkSecondaryLabel } from '@/profile/linkPresentation';
import { useProfileStore } from '@/profile/store';

export function PresentScreen(): ReactNode {
  const insets = useSafeAreaInsets();
  const record = useProfileStore((state) => state.record);
  const status = useProfileStore((state) => state.status);
  const linkVisibility = useProfileStore((state) => state.linkVisibility);
  const shared = useProfileStore((state) => state.shared);
  const jws = useProfileStore((state) => state.jws);
  const published = useProfileStore((state) => state.published);
  const nostrPublishedJws = useProfileStore((state) => state.nostrPublishedJws);
  const shareRecord = shared?.record ?? record;
  const shareJws = shared?.jws ?? jws;
  const publicPage: PublicPageShareSource | null = published
    ? { record: published.record, jws: published.jws }
    : null;
  const nostrShortUrlReady = published !== null && nostrPublishedJws === published.jws;
  const ownerName = record?.displayName.trim() ?? '';

  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <PresentHeader onScan={() => { router.push('/scan'); }} />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 100 + insets.bottom,
          gap: 20,
        }}
      >
        {status === 'ready' && shareRecord && shareJws ? (
          <>
            <PresentCard
              ownerName={ownerName.length > 0 ? ownerName : null}
              shareRecord={shareRecord}
              shareJws={shareJws}
              publicPage={publicPage}
              nostrShortUrlReady={nostrShortUrlReady}
            />
            <PublicPageSection links={presentPublicLinks(record?.links ?? [], linkVisibility)} />
          </>
        ) : (
          <MeProfileGate
            onCreatePage={() => { router.push('/me/edit'); }}
            onSetUpIdentity={() => { router.push('/onboarding?replay=1'); }}
          />
        )}
      </ScrollView>
    </View>
  );
}

/** `.phead` — centred screen title with the scan action pinned right, the
 *  same 34pt outlined square the Page tab's header actions use. */
function PresentHeader({ onScan }: { readonly onScan: () => void }): ReactNode {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center px-4" style={{ minHeight: 56 }}>
      <ThemedText
        accessibilityRole="header"
        variant="titleLarge"
        style={{ flex: 1, textAlign: 'center' }}
      >
        {t('present.title')}
      </ThemedText>
      <View style={{ position: 'absolute', right: 16 }}>
        <PageHeaderAction
          icon="qrcode.viewfinder"
          label={t('present.scanSomeone')}
          onPress={onScan}
        />
      </View>
    </View>
  );
}

function PublicPageSection({ links }: { readonly links: readonly PresentPublicLink[] }): ReactNode {
  const { t } = useTranslation();
  return (
    <View className="gap-3">
      <PageSectionLabel title={t('present.publicPage')} />
      {links.length === 0 ? (
        <ThemedSurface variant="outlined" padded>
          <ThemedText variant="bodyMedium" tone="tertiary">
            {t('present.noPublicLinks')}
          </ThemedText>
        </ThemedSurface>
      ) : (
        <PublicLinkGroup links={links} />
      )}
    </View>
  );
}

/**
 * `.xfixed` — the public-page fields, drawn as ONE grouped block with hairline
 * separators and no controls at all. The mock's rule: a public field is always
 * given, so it must not look like something you can switch off ("沒有控制項
 * 就是不能調").
 */
function PublicLinkGroup({
  links,
}: {
  readonly links: readonly PresentPublicLink[];
}): ReactNode {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  return (
    <View style={{ borderRadius: Radius.group, overflow: 'hidden', backgroundColor: colors.mutedSurface }}>
      {links.map(({ link, sourceIndex }, index) => (
        <Animated.View
          entering={fadeUpIn(index, reduceMotion)}
          key={`${String(sourceIndex)}-${link.label}-${link.url}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 9,
            paddingHorizontal: 12,
            borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
            borderTopColor: colors.divider,
          }}
        >
          <LinkIcon label={link.label} url={link.url} size={26} glyph={15} surface={colors.chipSurface} />
          <View style={{ flex: 1, gap: 1 }}>
            <ThemedText variant="bodyMedium" numberOfLines={1} ellipsizeMode="middle">
              {linkDisplay(link.label, link.url).text}
            </ThemedText>
            {linkSecondaryLabel(link.label, link.url) ? (
              <ThemedText variant="caption" tone="tertiary" numberOfLines={1}>
                {linkSecondaryLabel(link.label, link.url)}
              </ThemedText>
            ) : null}
          </View>
        </Animated.View>
      ))}
    </View>
  );
}
