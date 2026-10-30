/**
 * Verified Page person detail — 1.3.3 Task A2.3 (US-11). Landing screen
 * after 「存入 People」 in `VerifiedPageResultSheet`, and the target for
 * re-opening a previously-saved snapshot. Deliberately separate from
 * `app/people/[id].tsx` (the Contact/BusinessCard detail screen) — a
 * Profile Record snapshot has no `Contact` counterpart (see
 * `src/people/profileSnapshots.ts`'s module doc for why the two stores
 * stay parallel rather than merged).
 *
 * Reads the snapshot store directly by `did` route param — no PII carried
 * in the route itself, matching CLAUDE.md rule 10's "route params carry
 * chrome" only where it doesn't leak sensitive fields.
 *
 * Task A5.4 (US-20) extended this screen to also be the `solidarity://
 * pear/<did>` deep-link landing target: a `did` with no saved snapshot yet
 * renders `PearConnectSection`'s honest "connect privately" flow instead of
 * a dead-end not-found state — see that component's doc for why it's safe
 * to offer a Pear dial for ANY structurally valid did:key reaching this
 * screen (deep link or otherwise), not just ones that arrived via the deep
 * link specifically. A `did` that isn't even a well-formed did:key
 * (`isValidPearDid`, `@/deeplink/parser`) still falls back to the honest
 * not-found state — the deep-link parser already rejects those before
 * routing here, so this is only a fallback for a stale/mistyped snapshot
 * route.
 */
import { useLocalSearchParams } from 'expo-router';
import { safeBack } from '@/navigation/safeBack';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { CardExchangeSection } from '@/components/people/CardExchangeSection';
import { PageLocalDetailsSection } from '@/components/people/PageLocalDetails';
import { PearConnectSection } from '@/components/people/PearConnectSection';
import { VerifiedProfileView } from '@/components/scan/VerifiedProfileView';
import { ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { isValidPearDid } from '@/deeplink/parser';
import { fadeUpIn } from '@/feedback/motion';
import { useTranslation } from '@/i18n';
import { useProfileSnapshot } from '@/people/profileSnapshots';

export default function VerifiedProfileDetailScreen(): ReactNode {
  const { t } = useTranslation();
  const { did } = useLocalSearchParams<{ did: string }>();
  const snapshot = useProfileSnapshot(did);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  // Same chrome and section cascade as the contact detail
  // (`app/people/[id].tsx`): 56pt top bar, 16pt gutters, each section
  // entering on `fadeUpIn(index)` — a saved Page reads as the same kind of
  // person page as a contact, not a separate screen type.
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
            <VerifiedProfileView record={snapshot.record} />
          </Animated.View>
          <Animated.View entering={fadeUpIn(1, reduceMotion)}>
            <PageLocalDetailsSection snapshot={snapshot} />
          </Animated.View>
          <Animated.View entering={fadeUpIn(2, reduceMotion)}>
            <CardExchangeSection did={snapshot.did} verifiedDisplayName={snapshot.record.displayName} />
          </Animated.View>
        </ScrollView>
      ) : did && isValidPearDid(did) ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 16 }}>
          <Animated.View entering={fadeUpIn(0, reduceMotion)}>
            <PearConnectSection did={did} />
          </Animated.View>
        </ScrollView>
      ) : (
        <View className="flex-1 items-center justify-center gap-2 px-8">
          <SfIcon name="questionmark.circle" size={32} color={Colors.text3} />
          <ThemedText variant="bodyMedium" tone="secondary" style={{ textAlign: 'center' }}>
            {t('verifiedPage.notFound')}
          </ThemedText>
        </View>
      )}
    </View>
  );
}
