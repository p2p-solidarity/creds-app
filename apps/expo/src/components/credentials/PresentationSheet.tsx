import { useMemo, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PresentationQRPage } from '@/me/presentationQrPages';
import { ModalSheet } from '@/components/common/ModalSheet';
import { PressableScale } from '@/components/common/PressableScale';
import { PresentationProofQr } from '@/components/credentials/PresentationProofQr';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedText } from '@/components/themed/ThemedText';
import { Colors } from '@/constants/Colors';
import { useIdentityData, type ProvableClaimEntity } from '@/identity';
import {
  buildPresentationProofQrPages,
  disclosureErrorI18nKey,
  selectPresentationClaims,
  type PresentationCredential,
} from '@/credentials/presentationProof';

export interface PresentationSheetProps {
  readonly visible: boolean;
  readonly credential: PresentationCredential & { readonly title: string };
  readonly selectedClaimIds: ReadonlySet<string>;
  readonly onDismiss: () => void;
  /** Product flows keep proof mechanics usable without exposing claim diagnostics. */
  readonly productMode?: boolean;
}

export function PresentationSheet({
  visible,
  credential,
  selectedClaimIds,
  onDismiss,
  productMode = false,
}: PresentationSheetProps): ReactNode {
  return (
    <ModalSheet visible={visible} onRequestClose={onDismiss}>
      <PresentationBody
        credential={credential}
        selectedClaimIds={selectedClaimIds}
        onDismiss={onDismiss}
        productMode={productMode}
      />
    </ModalSheet>
  );
}

function PresentationBody({
  credential,
  selectedClaimIds,
  onDismiss,
  productMode,
}: {
  readonly credential: PresentationCredential & { readonly title: string };
  readonly selectedClaimIds: ReadonlySet<string>;
  readonly onDismiss: () => void;
  readonly productMode: boolean;
}): ReactNode {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const provableClaims = useIdentityData((s) => s.provableClaims);

  const allClaims: readonly ProvableClaimEntity[] = useMemo(
    () => provableClaims.filter((c) => c.identityCardId === credential.id),
    [provableClaims, credential.id],
  );

  const selectedClaims: readonly ProvableClaimEntity[] = useMemo(
    () => selectPresentationClaims(allClaims, selectedClaimIds),
    [allClaims, selectedClaimIds],
  );

  const proof = useMemo<
    { readonly pages: readonly PresentationQRPage[]; readonly error?: string }
  >(() => {
    // A passport is never presented from here (its badge lives on the Page,
    // 10 §4); say so instead of a generic "no claims" placeholder.
    if (credential.metadataTags.includes('passport-openac-v3')) {
      return { pages: [], error: t('credentialDetail.passportNotPresentable') };
    }
    if (selectedClaims.length === 0) return { pages: [] };
    const result = buildPresentationProofQrPages({
      credential,
      selectedClaims,
      allClaims,
    });
    return result.ok
      ? { pages: result.value }
      : { pages: [], error: t(disclosureErrorI18nKey(result.error)) };
  }, [credential, selectedClaims, allClaims, t]);

  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <View
        className="flex-row items-center justify-between px-4"
        style={{ height: 44 }}
      >
        <View style={{ width: 44 }} />
        <ThemedText variant="bodyMedium" style={{ fontWeight: '600' }}>
          Present
        </ThemedText>
        <PressableScale
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <SfIcon name="xmark" size={16} weight="semibold" color={Colors.text1} />
        </PressableScale>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 24,
          paddingBottom: insets.bottom + 24,
          gap: 24,
        }}
      >
        <PresentationProofQr
          credentialTitle={credential.title}
          selectedClaims={selectedClaims}
          pages={proof.pages}
          showTitle
          showClaimDetails={!productMode}
          {...(proof.error ? { emptyText: proof.error } : {})}
        />
      </ScrollView>
    </View>
  );
}
