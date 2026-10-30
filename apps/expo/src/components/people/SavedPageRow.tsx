/**
 * SavedPageRow — a locally-saved Page in the People A–Z list, sorted in with
 * the contacts (a saved Page is a person too). Verified Pages open
 * `/people/profile/[did]`; declared link-page imports open
 * `/people/declared/[id]` and carry a visible 「未驗證」 chip (CLAUDE.md rule 8 —
 * never let an unverified claim look verified).
 */
import { BrandIcon } from '@/components/icons/BrandIcon';
import { linkDisplay } from '@/profile/linkPresentation';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { snapshotDisplayName } from '@/components/people/ContactsList';
import { PageAvatar } from '@/components/people/PageAvatar';
import { ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { useTranslation } from '@/i18n';
import type {
  DeclaredSnapshot,
  ProfileSnapshot,
  VerifiedSnapshot,
} from '@/people/profileSnapshots';
import { verifiedAtRelative } from '@/people/relativeVerifiedAt';

export function SavedPageRow({
  snapshot,
}: {
  readonly snapshot: ProfileSnapshot;
}): ReactNode {
  return snapshot.kind === 'verified' ? (
    <VerifiedPageRow snapshot={snapshot} />
  ) : (
    <DeclaredPageRow snapshot={snapshot} />
  );
}

function VerifiedPageRow({
  snapshot,
}: {
  readonly snapshot: VerifiedSnapshot;
}): ReactNode {
  const { t } = useTranslation();

  return (
    <PressableScale
      haptic="tap"
      onPress={() => {
        router.push({ pathname: '/people/profile/[did]', params: { did: snapshot.did } });
      }}
      accessibilityRole="button"
      accessibilityLabel={snapshot.record.displayName}
      className="flex-row items-center gap-3 py-3"
      style={{
        borderBottomWidth: 0.5,
        borderBottomColor: Colors.divider,
      }}
    >
      <PageAvatar avatar={snapshot.record.avatar} displayName={snapshot.record.displayName} size={38} />
      <View className="flex-1" style={{ gap: 2 }}>
        <ThemedText variant="bodyLarge" numberOfLines={1}>
          {snapshot.record.displayName}
        </ThemedText>
        <ThemedText variant="caption" tone="tertiary" numberOfLines={1}>
          {relativeAtLabel(snapshot.verifiedAt, t)}
        </ThemedText>
      </View>
      <SfIcon name="chevron.right" size={12} weight="semibold" color={Colors.text3} />
    </PressableScale>
  );
}

function DeclaredPageRow({
  snapshot,
}: {
  readonly snapshot: DeclaredSnapshot;
}): ReactNode {
  const { t } = useTranslation();
  const displayTitle = snapshotDisplayName(snapshot);

  return (
    <PressableScale
      haptic="tap"
      onPress={() => {
        router.push({ pathname: '/people/declared/[id]', params: { id: snapshot.id } });
      }}
      accessibilityRole="button"
      accessibilityLabel={displayTitle}
      className="flex-row items-center gap-3 py-3"
      style={{
        borderBottomWidth: 0.5,
        borderBottomColor: Colors.divider,
      }}
    >
      <View
        className="items-center justify-center overflow-hidden rounded-full bg-searchBg"
        style={{ width: 38, height: 38 }}
      >
        <BrandIcon name={linkDisplay('', snapshot.sourceUrl).brand} size={20} color={Colors.text2} />
      </View>
      <View className="flex-1" style={{ gap: 2 }}>
        <ThemedText variant="bodyLarge" numberOfLines={1}>
          {displayTitle}
        </ThemedText>
        <ThemedText variant="caption" tone="tertiary" numberOfLines={1}>
          {`${linkDisplay('', snapshot.sourceUrl).text} · ${relativeAtLabel(snapshot.importedAt, t)}`}
        </ThemedText>
      </View>
      <View
        className="rounded-full border border-divider px-2 py-0.5"
        style={{ borderStyle: 'dashed' }}
      >
        <ThemedText variant="caption" tone="tertiary">
          {t('peopleList.declaredBadge')}
        </ThemedText>
      </View>
      <SfIcon name="chevron.right" size={12} weight="semibold" color={Colors.text3} />
    </PressableScale>
  );
}



/** Shared by both row kinds — `verifiedAt` for a verified row, `importedAt`
 * for a declared row; the bucketing math is identical either way. */
function relativeAtLabel(
  at: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const { unit, count } = verifiedAtRelative(at);
  switch (unit) {
    case 'justNow':
      return t('peopleList.verifiedPageJustNow');
    case 'minutes':
      return t('peopleList.verifiedPageMinutesAgo', { count });
    case 'hours':
      return t('peopleList.verifiedPageHoursAgo', { count });
    case 'days':
      return t('peopleList.verifiedPageDaysAgo', { count });
  }
}
