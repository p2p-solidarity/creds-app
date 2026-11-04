/**
 * "Ask for a credential" on a saved Page (docs/ref/16 §12). The request
 * carries only a purpose; the holder picks. Answers are shown as verified:
 * the issuer is named and a self-issued credential is called that, never
 * dressed up as proof of identity.
 */
import type { ProfileRecord } from '@solidarity/shared';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalSheet } from '@/components/common/ModalSheet';
import { FieldRow } from '@/components/people/EditContactSheet';
import { ThemedButton, ThemedSurface, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import type { PresentedCredentialView } from '@/privateExchange/credentialAnswer';
import { sendCredentialRequest } from '@/privateExchange/credentialExchange';
import { recipientHexOf } from '@/privateExchange/send';
import type { OutgoingCredentialRequest } from '@/privateExchange/store';

import { shortDid } from './PassportConsentSheet';
import { useCredentialOutgoingFor, usePrivateInboxSync } from './usePrivateExchange';

export function CredentialRequestSection({ record }: { readonly record: ProfileRecord }): ReactNode {
  const { t } = useTranslation();
  usePrivateInboxSync();
  const requests = useCredentialOutgoingFor(record.did);
  const [asking, setAsking] = useState(false);
  if (recipientHexOf(record) === null) return null;
  const now = Math.floor(Date.now() / 1000);
  const latest = requests[0];
  const waiting = latest?.answer === null && latest.exp > now;

  return (
    <View style={{ gap: 8 }}>
      {requests.slice(0, 3).map((request) => (
        <CredentialRequestStatus key={request.id} request={request} name={record.displayName} now={now} />
      ))}
      {waiting ? null : (
        <ThemedButton
          fullWidth
          variant="secondary"
          icon="lock"
          label={t('privateExchange.credential.button')}
          onPress={() => { setAsking(true); }}
        />
      )}
      <ModalSheet visible={asking} presentationStyle="formSheet" onRequestClose={() => { setAsking(false); }}>
        <CredentialRequestForm record={record} onClose={() => { setAsking(false); }} />
      </ModalSheet>
    </View>
  );
}

function CredentialRequestStatus({
  request,
  name,
  now,
}: {
  readonly request: OutgoingCredentialRequest;
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
            ? t('privateExchange.credential.waiting', { date: new Date(request.exp * 1000).toLocaleDateString() })
            : t('privateExchange.request.expired')}
        </ThemedText>
      </ThemedSurface>
    );
  }
  return (
    <ThemedSurface variant="card" padded style={{ gap: 10 }}>
      <ThemedText variant="label" tone="secondary">{t('privateExchange.answer.title', { name })}</ThemedText>
      {answer.credentials.map((credential, index) => (
        <PresentedCredential key={`${credential.issuerDid}-${String(index)}`} credential={credential} />
      ))}
      <ThemedText variant="caption" tone="tertiary">
        {t('privateExchange.answer.checkedAt', { time: new Date(answer.verifiedAt * 1000).toLocaleString() })}
      </ThemedText>
    </ThemedSurface>
  );
}

function PresentedCredential({ credential }: { readonly credential: PresentedCredentialView }): ReactNode {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 4 }}>
      <ThemedText variant="bodyMedium">{credential.type}</ThemedText>
      <ThemedText variant="caption" tone="tertiary" selectable>
        {credential.issuer === 'self'
          ? t('privateExchange.credential.selfIssued')
          : t('privateExchange.credential.unknownIssuer', { did: shortDid(credential.issuerDid) })}
      </ThemedText>
      {credential.fields.map((field) => (
        <View key={field.name} className="flex-row items-baseline justify-between gap-3">
          <ThemedText variant="bodySmall" tone="secondary">{field.name}</ThemedText>
          <ThemedText variant="bodyMedium" selectable style={{ flexShrink: 1, textAlign: 'right' }}>{field.value}</ThemedText>
        </View>
      ))}
    </View>
  );
}

function CredentialRequestForm({ record, onClose }: { readonly record: ProfileRecord; readonly onClose: () => void }): ReactNode {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [purpose, setPurpose] = useState('');
  const [sending, setSending] = useState(false);
  // Inline, not a toast: the toast overlay renders under this native sheet.
  const [failure, setFailure] = useState<string | null>(null);

  const onSend = (): void => {
    setSending(true);
    setFailure(null);
    void sendCredentialRequest(record, purpose)
      .then((result) => {
        if (result.ok) {
          pushToast(t('privateExchange.request.sent'), 'success');
          onClose();
        } else {
          setFailure(t(`privateExchange.error.${result.error}`));
        }
      })
      .finally(() => { setSending(false); });
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.pageBg }}>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={16}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: insets.bottom + 32 }}
      >
        <View style={{ rowGap: 20 }}>
          <View style={{ gap: 6 }}>
            <ThemedText variant="titleLarge">{t('privateExchange.credential.title', { name: record.displayName })}</ThemedText>
            <ThemedText variant="bodyMedium" tone="secondary">{t('privateExchange.credential.body')}</ThemedText>
          </View>
          <FieldRow
            label={t('privateExchange.credential.purposeLabel')}
            placeholder={t('pageLocalDetails.optional')}
            value={purpose}
            onChange={(v) => { setPurpose(v.slice(0, 140)); }}
            autoCapitalize="sentences"
            multiline
          />
          <ThemedText variant="bodySmall" tone="tertiary">{t('privateExchange.privacyNote')}</ThemedText>
          {failure === null ? null : (
            <ThemedText variant="bodySmall" tone="error" accessibilityLiveRegion="polite">{failure}</ThemedText>
          )}
          <ThemedButton fullWidth label={t('privateExchange.request.send')} loading={sending} disabled={sending} onPress={onSend} />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
