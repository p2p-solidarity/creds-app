/**
 * Declared link-page detail — 1.3.3 Task A2.4 (US-19). The counterpart to
 * `app/people/profile/[did].tsx` for a `kind: 'declared'` snapshot
 * (`src/people/profileSnapshots.ts`) — a plaintext link page (Linktree or
 * similar) someone pasted via People's 「貼上連結頁」, NOT a cryptographically
 * verified page. It gets its OWN route (keyed by `stableDeclaredId
 * (sourceUrl)`, not a did — a declared entry has none) rather than
 * overloading `/people/profile/[did]`, so the two can never be confused at
 * the routing layer either.
 *
 * Every declared page renders an unmistakable 「宣稱‧未驗證」 badge plus an
 * explicit disclaimer sentence — CLAUDE.md rule 8: this content is exactly
 * what the source URL published, with zero cryptographic verification, and
 * the screen must never suggest otherwise. A missing snapshot (bad/stale
 * deep link) renders an honest not-found state rather than a blank screen.
 */
import { useLocalSearchParams } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/common/PressableScale';
import { BrandIcon } from '@/components/icons/BrandIcon';
import { SfIcon } from '@/components/icons/SfIcon';
import {
  ChipBase,
  PersonHeroCard,
  PersonLinksCard,
  buildLinkRows,
} from '@/components/people/personDetailSupport';
import { snapshotDisplayName } from '@/components/people/ContactsList';
import { ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { fadeUpIn } from '@/feedback/motion';
import { useTranslation } from '@/i18n';
import { safeBack } from '@/navigation/safeBack';
import { useDeclaredSnapshot } from '@/people/profileSnapshots';
import { linkDisplay } from '@/profile/linkPresentation';

export default function DeclaredPageDetailScreen(): ReactNode {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const { id } = useLocalSearchParams<{ id: string }>();
  const snapshot = useDeclaredSnapshot(id);
  const insets = useSafeAreaInsets();
  const linkRows = useMemo(
    () => (snapshot ? buildLinkRows([{ label: '', url: snapshot.sourceUrl }, ...snapshot.links]) : []),
    [snapshot],
  );

  // Same chrome and card as the contact / saved Page detail: a declared Page
  // is a person in People too — only its chip says it is unverified.
  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-3" style={{ height: 56 }}>
        <PressableScale
          onPress={() => { safeBack(); }}
          accessibilityRole="button"
          accessibilityLabel={t('personDetail.back')}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <SfIcon name="chevron.left" size={24} color={Colors.text1} />
        </PressableScale>
      </View>

      {snapshot ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 16 }}>
          <Animated.View entering={fadeUpIn(0, reduceMotion)}>
            <PersonHeroCard>
              <View
                className="items-center justify-center rounded-full bg-searchBg"
                style={{ width: 88, height: 88 }}
              >
                <BrandIcon name={linkDisplay('', snapshot.sourceUrl).brand} size={36} color={Colors.text2} />
              </View>
              <ThemedText variant="headlineMedium" numberOfLines={2} style={{ textAlign: 'center' }}>
                {snapshotDisplayName(snapshot)}
              </ThemedText>
              <ChipBase icon="questionmark.circle" iconColor={Colors.text2} label={t('declaredPage.badge')} />
            </PersonHeroCard>
          </Animated.View>

          <Animated.View entering={fadeUpIn(1, reduceMotion)}>
            <ThemedText variant="bodySmall" tone="secondary">
              {t('declaredPage.disclaimer')}
            </ThemedText>
          </Animated.View>

          <Animated.View entering={fadeUpIn(2, reduceMotion)}>
            <PersonLinksCard rows={linkRows} />
          </Animated.View>
        </ScrollView>
      ) : (
        <View className="flex-1 items-center justify-center gap-2 px-8">
          <SfIcon name="questionmark.circle" size={32} color={Colors.text3} />
          <ThemedText variant="bodyMedium" tone="secondary" style={{ textAlign: 'center' }}>
            {t('declaredPage.notFound')}
          </ThemedText>
        </View>
      )}
    </View>
  );
}
