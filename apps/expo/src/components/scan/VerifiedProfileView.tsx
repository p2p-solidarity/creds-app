/**
 * VerifiedProfileView — the shared "here's the Verified Page we locally
 * verified" presentation (1.3.3 Task A2.3, US-11). Used by both
 * `VerifiedPageResultSheet` (fresh scan result) and the People detail
 * screen (`app/people/profile/[did].tsx`, a persisted snapshot) so the two
 * never drift — both show the person's Page itself (`PageLivePreview`).
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
import { ChipBase } from '@/components/people/personDetailSupport';
import { WitnessSection } from '@/components/scan/WitnessSection';
import { Colors } from '@/constants/Colors';
import { useTranslation } from '@/i18n';
import { createInitialPageDesign } from '@/page/pageDesign';
import type { VerifiedHandleBinding } from '@/scan/verifiedPageHandler';
import type { ProfileRecord } from '@solidarity/shared';

export interface VerifiedProfileViewProps {
  readonly record: ProfileRecord;
  readonly handleBinding?: VerifiedHandleBinding;
}

/** Opens on the person's Page exactly as visitors see it — their published
 *  design, or the default Page of their signed links when they never
 *  designed one — then the signature / handle chips and this phone's checks. */
export function VerifiedProfileView({ record, handleBinding }: VerifiedProfileViewProps): ReactNode {
  const { t } = useTranslation();
  const design = useMemo(() => record.page ?? createInitialPageDesign(), [record.page]);
  return (
    <View style={{ gap: 16 }}>
      <PageLivePreview
        record={record}
        blocks={design.blocks}
        appearance={design.appearance}
        variant="public"
        handle={handleBinding?.handle ?? null}
      />

      <View className="flex-row flex-wrap items-center gap-2">
        <ChipBase
          icon="checkmark.seal.fill"
          iconColor={Colors.terminalGreen}
          labelColor={Colors.terminalGreen}
          label={t('verifiedPage.signatureValid')}
        />
        {handleBinding ? <HandleBindingBadge binding={handleBinding} /> : null}
      </View>

      <WitnessSection record={record} />
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
