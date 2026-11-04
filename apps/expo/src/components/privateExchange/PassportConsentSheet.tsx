/**
 * Consent for a private passport request (docs/ref/16 §4, §11.4). Who is
 * asking comes only from their verified Page (name + short DID, plus "not in
 * your People"); the holder ticks what to give; Share runs Face ID, then the
 * device-signed answer is sent. Declining sends nothing.
 */
import type { PassportRequestClaim } from '@solidarity/shared';
import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalSheet } from '@/components/common/ModalSheet';
import { ThemedButton, ThemedSurface, ThemedSwitch, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import { getProfileSnapshot } from '@/people/profileSnapshots';
import { answerPassportRequest, dismissPassportRequest, passportClaimsFor } from '@/privateExchange/passportExchange';
import type { IncomingPassportRequest } from '@/privateExchange/store';
import { deviceAttestSupported } from '@/witness/deviceKey';

export function shortDid(did: string): string {
  return did.length <= 28 ? did : `${did.slice(0, 16)}…${did.slice(-6)}`;
}

export function PassportConsentSheet({
  request,
  onClose,
}: {
  readonly request: IncomingPassportRequest | null;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <ModalSheet visible={request !== null} presentationStyle="formSheet" onRequestClose={onClose}>
      {request !== null ? <ConsentBody key={request.id} request={request} onClose={onClose} /> : null}
    </ModalSheet>
  );
}

function ConsentBody({ request, onClose }: { readonly request: IncomingPassportRequest; readonly onClose: () => void }): ReactNode {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { stored, available } = useMemo(() => passportClaimsFor(request), [request]);
  const [chosen, setChosen] = useState<readonly PassportRequestClaim[]>(available);
  const [sending, setSending] = useState(false);
  // Inline, not a toast: the toast overlay renders under this native sheet.
  const [failure, setFailure] = useState<string | null>(null);
  const inPeople = getProfileSnapshot(request.senderDid) !== undefined;
  const attestable = deviceAttestSupported();

  const toggle = (claim: PassportRequestClaim, on: boolean): void => {
    setChosen((prev) => (on ? [...prev.filter((c) => c !== claim), claim] : prev.filter((c) => c !== claim)));
  };

  const onShare = (): void => {
    setSending(true);
    setFailure(null);
    void answerPassportRequest(request, chosen)
      .then((result) => {
        if (result.ok) {
          pushToast(t(result.value.deviceAttested ? 'privateExchange.consent.sent' : 'privateExchange.consent.sentUnattested'), 'success');
          onClose();
        } else {
          setFailure(t(`privateExchange.error.${result.error}`));
        }
      })
      .finally(() => { setSending(false); });
  };

  const onDecline = (): void => {
    dismissPassportRequest(request.id);
    onClose();
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.pageBg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: insets.bottom + 24, gap: 16 }}>
        <View style={{ gap: 4 }}>
          <ThemedText variant="titleLarge">{t('privateExchange.consent.title', { name: request.senderName })}</ThemedText>
          <ThemedText variant="caption" tone="tertiary" selectable>
            {shortDid(request.senderDid)}
            {inPeople ? '' : ` · ${t('privateExchange.consent.notInPeople')}`}
          </ThemedText>
          <ThemedText variant="caption" tone="tertiary">{t('privateExchange.consent.nameNote')}</ThemedText>
        </View>

        {stored === null ? (
          <ThemedSurface variant="inset" padded>
            <ThemedText variant="bodyMedium">{t('privateExchange.consent.noPassport')}</ThemedText>
          </ThemedSurface>
        ) : (
          <View style={{ gap: 8 }}>
            <ThemedText variant="label" tone="secondary">{t('privateExchange.consent.choose')}</ThemedText>
            <ThemedSurface variant="card">
              {request.claims.map((claim, index) => {
                const has = available.includes(claim);
                return (
                  <View
                    key={claim}
                    className="flex-row items-center px-4"
                    style={{ minHeight: 52, borderTopWidth: index === 0 ? 0 : 0.5, borderTopColor: Colors.divider }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <ThemedText variant="bodyMedium" tone={has ? 'primary' : 'tertiary'}>
                        {t(`privateExchange.claim.${claim}`)}
                      </ThemedText>
                      {has ? null : (
                        <ThemedText variant="caption" tone="tertiary">{t('privateExchange.consent.unavailable')}</ThemedText>
                      )}
                    </View>
                    <ThemedSwitch
                      value={chosen.includes(claim)}
                      disabled={!has || sending}
                      onValueChange={(on) => { toggle(claim, on); }}
                      accessibilityLabel={t(`privateExchange.claim.${claim}`)}
                    />
                  </View>
                );
              })}
            </ThemedSurface>
          </View>
        )}

        {stored !== null && !attestable ? (
          <ThemedText variant="bodySmall" tone="secondary">{t('privateExchange.consent.noAttest')}</ThemedText>
        ) : null}
        <ThemedText variant="bodySmall" tone="tertiary">{t('privateExchange.privacyNote')}</ThemedText>

        <View style={{ gap: 10 }}>
          {failure === null ? null : (
            <ThemedText variant="bodySmall" tone="error" accessibilityLiveRegion="polite">{failure}</ThemedText>
          )}
          <ThemedButton
            fullWidth
            icon="faceid"
            label={t('privateExchange.consent.share')}
            loading={sending}
            disabled={stored === null || chosen.length === 0}
            onPress={onShare}
          />
          <ThemedButton fullWidth variant="secondary" label={t('privateExchange.consent.decline')} disabled={sending} onPress={onDecline} />
          <ThemedText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
            {t('privateExchange.consent.declineNote')}
          </ThemedText>
        </View>
      </ScrollView>
    </View>
  );
}
