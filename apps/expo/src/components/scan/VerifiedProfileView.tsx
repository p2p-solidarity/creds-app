/**
 * VerifiedProfileView — the shared "here's the Verified Page we locally
 * verified" presentation (1.3.3 Task A2.3, US-11). Used by both
 * `VerifiedPageResultSheet` (fresh scan result) and the People detail
 * screen (`app/people/profile/[did].tsx`, a persisted snapshot) so the two
 * never drift — same displayName/bio/links layout either way.
 *
 * When the page arrived through a live handle read, `handleBinding` carries
 * the fresh bidirectional gate verdict and is rendered separately: only an
 * exact `verified` result gets a filled green seal; declared/stale/revoked
 * remain visibly non-green.
 */
import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';

import { handleBadgeViewModel } from '@/badges/handleBadgeDisplay';
import { PageLivePreview } from '@/components/me/PageLivePreview';
import { PageAvatar } from '@/components/people/PageAvatar';
import {
  ChipBase,
  PersonHeroCard,
  PersonLinksCard,
  buildLinkRows,
} from '@/components/people/personDetailSupport';
import { WitnessSection } from '@/components/scan/WitnessSection';
import { ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { useTranslation } from '@/i18n';
import type { VerifiedHandleBinding } from '@/scan/verifiedPageHandler';
import type { ProfileRecord } from '@solidarity/shared';

export interface VerifiedProfileViewProps {
  readonly record: ProfileRecord;
  readonly handleBinding?: VerifiedHandleBinding;
}

/** Opens on the same name card a contact does (`PersonHeroCard`): avatar,
 *  name, bio and the signature / handle chips, then this phone's checks,
 *  then the published Page or its links as tappable rows. */
export function VerifiedProfileView({ record, handleBinding }: VerifiedProfileViewProps): ReactNode {
  const { t } = useTranslation();
  const linkRows = useMemo(() => buildLinkRows(record.links), [record.links]);
  return (
    <View style={{ gap: 16 }}>
      <PersonHeroCard>
        <PageAvatar avatar={record.avatar} displayName={record.displayName} size={88} />
        <ThemedText variant="headlineMedium" numberOfLines={2} style={{ textAlign: 'center' }}>
          {record.displayName}
        </ThemedText>
        {record.bio.length > 0 ? (
          <ThemedText variant="bodySmall" tone="secondary" numberOfLines={3} style={{ textAlign: 'center' }}>
            {record.bio}
          </ThemedText>
        ) : null}
        <View className="flex-row flex-wrap items-center justify-center gap-2">
          <ChipBase
            icon="checkmark.seal.fill"
            iconColor={Colors.terminalGreen}
            labelColor={Colors.terminalGreen}
            label={t('verifiedPage.signatureValid')}
          />
          {handleBinding ? <HandleBindingBadge binding={handleBinding} /> : null}
        </View>
      </PersonHeroCard>

      <WitnessSection record={record} />

      {record.page ? (
        <View style={{ gap: 8 }}>
          <ThemedText variant="caption" tone="tertiary">
            {t('pageDesign.publishedPage')}
          </ThemedText>
          <PageLivePreview
            record={record}
            blocks={record.page.blocks}
            appearance={record.page.appearance}
            variant="public"
            handle={handleBinding?.handle ?? null}
          />
        </View>
      ) : (
        <PersonLinksCard rows={linkRows} />
      )}
    </View>
  );
}

function HandleBindingBadge({ binding }: { readonly binding: VerifiedHandleBinding }): ReactNode {
  const { t } = useTranslation();
  const { state } = binding;
  // The page is on screen while the live two-way check still runs: grey, never a seal.
  const model =
    state === 'checking'
      ? { visual: 'checking' as const, labelKey: 'verifiedPage.handleBadge.checking' as const }
      : handleBadgeViewModel(state);
  const style = (() => {
    switch (model.visual) {
      case 'checking':
        return { icon: 'clock' as const, color: Colors.text3 };
      case 'verified':
        return { icon: 'checkmark.seal.fill' as const, color: Colors.terminalGreen };
      case 'declared':
        return { icon: 'checkmark.seal' as const, color: Colors.warning };
      case 'stale':
        return { icon: 'exclamationmark.triangle' as const, color: Colors.text3 };
      case 'revoked':
        return { icon: 'xmark.seal.fill' as const, color: Colors.destructive };
    }
  })();

  return (
    <ChipBase
      icon={style.icon}
      iconColor={style.color}
      labelColor={style.color}
      label={`${binding.handle} · ${t(model.labelKey)}`}
    />
  );
}
