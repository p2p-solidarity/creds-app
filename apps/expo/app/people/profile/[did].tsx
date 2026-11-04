/**
 * Verified Page person detail. Landing screen
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
 * A `did` with no saved snapshot renders the honest not-found state.
 */
import { useLocalSearchParams } from 'expo-router';
import { safeBack } from '@/navigation/safeBack';
import type { ReactNode } from 'react';
import { ScrollView, Share, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { buildProfileShareModel } from '@/components/me/meProfileModel';
import { PageLocalDetailsSection } from '@/components/people/PageLocalDetails';
import { PassportRequestSection } from '@/components/privateExchange/PassportRequestSection';
import { VerifiedProfileView } from '@/components/scan/VerifiedProfileView';
import { ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { haptic } from '@/feedback/haptics';
import { fadeUpIn } from '@/feedback/motion';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import { useProfileSnapshot } from '@/people/profileSnapshots';

export default function VerifiedProfileDetailScreen(): ReactNode {
  const { t } = useTranslation();
  const { did } = useLocalSearchParams<{ did: string }>();
  const snapshot = useProfileSnapshot(did);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  // The saved Page's self-contained signed fragment. Not the short `#nostr:`
  // pointer: a snapshot that arrived by QR or offline link gives no proof the
  // owner ever published that pointer, so a short link could resolve to nothing.
  const onShare = (): void => {
    if (!snapshot) return;
    const url = buildProfileShareModel(snapshot.record, snapshot.jws).offlineUrl;
    void Share.share({ title: snapshot.record.displayName, message: url, url }).catch(() => {
      haptic('error');
      pushToast(t('personDetail.shareFailed'), 'error');
    });
  };

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
        <View style={{ flex: 1 }} />
        {snapshot ? (
          <PressableScale
            onPress={onShare}
            accessibilityRole="button"
            accessibilityLabel={t('personDetail.share')}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <SfIcon name="square.and.arrow.up" size={20} color={Colors.text1} />
          </PressableScale>
        ) : null}
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
            <PassportRequestSection record={snapshot.record} />
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
