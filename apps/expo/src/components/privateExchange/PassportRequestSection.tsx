/**
 * "Request passport details" on a saved Page (docs/ref/16 §4, §11). Shows
 * what I asked this person and their verified answer — the tier exactly as
 * verified (L1 is never drawn as L3).
 */
import { PASSPORT_REQUEST_CLAIMS, type PassportRequestClaim, type ProfileRecord } from '@solidarity/shared';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalSheet } from '@/components/common/ModalSheet';
import { ThemedButton, ThemedSurface, ThemedSwitch, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import { recipientHexOf, sendPassportRequest } from '@/privateExchange/passportExchange';
import type { OutgoingPassportRequest } from '@/privateExchange/store';

import { useOutgoingFor, usePrivateInboxSync } from './usePrivateExchange';

export function PassportRequestSection({ record }: { readonly record: ProfileRecord }): ReactNode {
  const { t } = useTranslation();
  usePrivateInboxSync();
  const requests = useOutgoingFor(record.did);
  const [asking, setAsking] = useState(false);
  const reachable = recipientHexOf(record) !== null;
  const now = Math.floor(Date.now() / 1000);
  const latest = requests[0];
  const waiting = latest?.answer === null && latest.exp > now;

  return (
    <View style={{ gap: 8 }}>
      <ThemedText variant="caption" tone="tertiary">{t('privateExchange.section.title')}</ThemedText>
      {requests.slice(0, 3).map((request) => (
        <RequestStatus key={request.id} request={request} name={record.displayName} now={now} />
      ))}
      {reachable ? (
        waiting ? null : (
          <ThemedButton
            fullWidth
            variant="secondary"
            icon="lock"
            label={t('privateExchange.request.button')}
            onPress={() => { setAsking(true); }}
          />
        )
      ) : (
        <ThemedText variant="bodySmall" tone="tertiary">
          {t('privateExchange.request.notOnNostr', { name: record.displayName })}
        </ThemedText>
      )}
      <ModalSheet visible={asking} presentationStyle="formSheet" onRequestClose={() => { setAsking(false); }}>
        <RequestForm record={record} onClose={() => { setAsking(false); }} />
      </ModalSheet>
    </View>
  );
}

function RequestStatus({
  request,
  name,
  now,
}: {
  readonly request: OutgoingPassportRequest;
  readonly name: string;
  readonly now: number;
}): ReactNode {
  const { t } = useTranslation();
  const { answer } = request;
  if (answer === null) {
    return (
      <ThemedSurface variant="inset" padded>
        <ThemedText variant="bodySmall" tone="secondary">
          {request.exp > now
            ? t('privateExchange.request.waiting', { date: new Date(request.exp * 1000).toLocaleDateString() })
            : t('privateExchange.request.expired')}
        </ThemedText>
      </ThemedSurface>
    );
  }
  const tierKey = answer.tier === 'L3' ? 'L3' : answer.chip === 'simulated' ? 'simulated' : 'L1';
  return (
    <ThemedSurface variant="card" padded style={{ gap: 6 }}>
      <ThemedText variant="label" tone="secondary">{t('privateExchange.answer.title', { name })}</ThemedText>
      {answer.claims.name !== undefined ? (
        <Row label={t('privateExchange.claim.passport.name')} value={answer.claims.name} />
      ) : null}
      {answer.claims.nationality !== undefined ? (
        <Row label={t('privateExchange.claim.passport.nationality')} value={answer.claims.nationality} />
      ) : null}
      <ThemedText variant="caption" tone={answer.tier === 'L3' ? 'accent' : 'tertiary'}>
        {t(`privateExchange.tier.${tierKey}`)}
      </ThemedText>
      <ThemedText variant="caption" tone="tertiary">
        {t('privateExchange.answer.checkedAt', { time: new Date(answer.verifiedAt * 1000).toLocaleString() })}
      </ThemedText>
    </ThemedSurface>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }): ReactNode {
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <ThemedText variant="bodySmall" tone="secondary">{label}</ThemedText>
      <ThemedText variant="bodyMedium" selectable style={{ flexShrink: 1, textAlign: 'right' }}>{value}</ThemedText>
    </View>
  );
}

function RequestForm({ record, onClose }: { readonly record: ProfileRecord; readonly onClose: () => void }): ReactNode {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [chosen, setChosen] = useState<readonly PassportRequestClaim[]>(['passport.name']);
  const [sending, setSending] = useState(false);

  const onSend = (): void => {
    setSending(true);
    void sendPassportRequest(record, chosen)
      .then((result) => {
        if (result.ok) {
          pushToast(t('privateExchange.request.sent'), 'success');
          onClose();
        } else {
          pushToast(t(`privateExchange.error.${result.error}`), 'error');
        }
      })
      .finally(() => { setSending(false); });
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.pageBg, padding: 16, paddingTop: 24, paddingBottom: insets.bottom + 24, gap: 16 }}>
      <View style={{ gap: 6 }}>
        <ThemedText variant="titleLarge">{t('privateExchange.request.title', { name: record.displayName })}</ThemedText>
        <ThemedText variant="bodyMedium" tone="secondary">{t('privateExchange.request.body')}</ThemedText>
      </View>
      <ThemedSurface variant="card">
        {PASSPORT_REQUEST_CLAIMS.map((claim, index) => (
          <View
            key={claim}
            className="flex-row items-center px-4"
            style={{ minHeight: 52, borderTopWidth: index === 0 ? 0 : 0.5, borderTopColor: Colors.divider }}
          >
            <ThemedText variant="bodyMedium" style={{ flex: 1 }}>{t(`privateExchange.claim.${claim}`)}</ThemedText>
            <ThemedSwitch
              value={chosen.includes(claim)}
              disabled={sending}
              onValueChange={(on) => {
                setChosen((prev) => (on ? [...prev.filter((c) => c !== claim), claim] : prev.filter((c) => c !== claim)));
              }}
              accessibilityLabel={t(`privateExchange.claim.${claim}`)}
            />
          </View>
        ))}
      </ThemedSurface>
      <ThemedText variant="bodySmall" tone="tertiary">{t('privateExchange.privacyNote')}</ThemedText>
      <ThemedButton
        fullWidth
        label={t('privateExchange.request.send')}
        loading={sending}
        disabled={chosen.length === 0}
        onPress={onSend}
      />
    </View>
  );
}
