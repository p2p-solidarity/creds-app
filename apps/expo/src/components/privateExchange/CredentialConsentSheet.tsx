/**
 * Consent for a private credential request (docs/ref/16 §12). Who is asking
 * comes from their verified Page (name + short DID, "not in your People");
 * their purpose is shown as theirs. The holder picks one credential and, for
 * an SD-JWT, which fields; Share runs Face ID, then the VP and the root
 * binding are signed and sent. Declining sends nothing.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalSheet } from '@/components/common/ModalSheet';
import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedButton, ThemedSurface, ThemedSwitch, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import { getProfileSnapshot } from '@/people/profileSnapshots';
import {
  answerCredentialRequest,
  dismissCredentialRequest,
  listPresentableCredentials,
  type PresentableCredential,
} from '@/privateExchange/credentialExchange';
import type { IncomingCredentialRequest } from '@/privateExchange/store';

import { shortDid } from './PassportConsentSheet';

type Loaded = { readonly kind: 'loading' } | { readonly kind: 'ready'; readonly list: readonly PresentableCredential[] } | { readonly kind: 'error' };

export function CredentialConsentSheet({
  request,
  onClose,
}: {
  readonly request: IncomingCredentialRequest | null;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <ModalSheet visible={request !== null} presentationStyle="formSheet" onRequestClose={onClose}>
      {request !== null ? <ConsentBody key={request.id} request={request} onClose={onClose} /> : null}
    </ModalSheet>
  );
}

function ConsentBody({ request, onClose }: { readonly request: IncomingCredentialRequest; readonly onClose: () => void }): ReactNode {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [picked, setPicked] = useState<string | null>(null);
  const [fields, setFields] = useState<readonly string[]>([]);
  const [sending, setSending] = useState(false);
  // Inline, not a toast: the toast overlay renders under this native sheet.
  const [failure, setFailure] = useState<string | null>(null);
  const inPeople = getProfileSnapshot(request.senderDid) !== undefined;

  useEffect(() => {
    let live = true;
    listPresentableCredentials()
      .then((list) => { if (live) setLoaded({ kind: 'ready', list }); })
      .catch(() => { if (live) setLoaded({ kind: 'error' }); });
    return () => { live = false; };
  }, []);

  const list = loaded.kind === 'ready' ? loaded.list : [];
  const chosen = list.find((c) => c.id === picked);

  const pick = (credential: PresentableCredential): void => {
    setPicked(credential.id);
    setFields(credential.fields);
  };

  const onShare = (): void => {
    if (chosen === undefined) return;
    setSending(true);
    setFailure(null);
    void answerCredentialRequest(request, { credentialId: chosen.id, fields: chosen.fields.length === 0 ? null : fields })
      .then((result) => {
        if (result.ok) {
          pushToast(t('privateExchange.consent.sent'), 'success');
          onClose();
        } else {
          setFailure(t(`privateExchange.error.${result.error}`));
        }
      })
      .finally(() => { setSending(false); });
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.pageBg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: insets.bottom + 24, gap: 16 }}>
        <View style={{ gap: 4 }}>
          <ThemedText variant="titleLarge">{t('privateExchange.credential.consentTitle', { name: request.senderName })}</ThemedText>
          <ThemedText variant="caption" tone="tertiary" selectable>
            {shortDid(request.senderDid)}
            {inPeople ? '' : ` · ${t('privateExchange.consent.notInPeople')}`}
          </ThemedText>
          <ThemedText variant="caption" tone="tertiary">{t('privateExchange.consent.nameNote')}</ThemedText>
        </View>
        {request.purpose === null ? null : (
          <ThemedSurface variant="inset" padded style={{ gap: 4 }}>
            <ThemedText variant="caption" tone="tertiary">{t('privateExchange.credential.theirPurpose')}</ThemedText>
            <ThemedText variant="bodyMedium" selectable>{request.purpose}</ThemedText>
          </ThemedSurface>
        )}

        {loaded.kind === 'loading' ? (
          <ThemedText variant="bodyMedium" tone="secondary">{t('privateExchange.credential.loading')}</ThemedText>
        ) : loaded.kind === 'error' ? (
          <ThemedText variant="bodyMedium" tone="error">{t('privateExchange.credential.loadFailed')}</ThemedText>
        ) : list.length === 0 ? (
          <ThemedSurface variant="inset" padded>
            <ThemedText variant="bodyMedium">{t('privateExchange.credential.noneToShow')}</ThemedText>
          </ThemedSurface>
        ) : (
          <View style={{ gap: 8 }}>
            <ThemedText variant="label" tone="secondary">{t('privateExchange.credential.choose')}</ThemedText>
            <ThemedSurface variant="card" style={{ overflow: 'hidden' }}>
              {list.map((credential, index) => (
                <PressableScale
                  key={credential.id}
                  onPress={() => { pick(credential); }}
                  disabled={sending}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: picked === credential.id }}
                  className="flex-row items-center gap-3 px-4 py-3"
                  style={{ minHeight: 56, borderTopWidth: index === 0 ? 0 : 0.5, borderTopColor: Colors.divider }}
                >
                  <SfIcon
                    name={picked === credential.id ? 'checkmark.circle.fill' : 'circle'}
                    size={20}
                    color={picked === credential.id ? Colors.primaryBlue : Colors.text3}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <ThemedText variant="bodyMedium">{credential.title}</ThemedText>
                    <ThemedText variant="caption" tone="tertiary">
                      {credential.selfIssued
                        ? t('privateExchange.credential.selfIssuedMine')
                        : t('privateExchange.credential.issuer', { did: shortDid(credential.issuerDid) })}
                    </ThemedText>
                  </View>
                </PressableScale>
              ))}
            </ThemedSurface>
          </View>
        )}

        {chosen !== undefined && chosen.fields.length > 0 ? (
          <View style={{ gap: 8 }}>
            <ThemedText variant="label" tone="secondary">{t('privateExchange.credential.chooseFields')}</ThemedText>
            <ThemedSurface variant="card">
              {chosen.fields.map((field, index) => (
                <View
                  key={field}
                  className="flex-row items-center px-4"
                  style={{ minHeight: 52, borderTopWidth: index === 0 ? 0 : 0.5, borderTopColor: Colors.divider }}
                >
                  <ThemedText variant="bodyMedium" style={{ flex: 1 }}>{field}</ThemedText>
                  <ThemedSwitch
                    value={fields.includes(field)}
                    disabled={sending}
                    onValueChange={(on) => {
                      setFields((prev) => (on ? [...prev.filter((f) => f !== field), field] : prev.filter((f) => f !== field)));
                    }}
                    accessibilityLabel={field}
                  />
                </View>
              ))}
            </ThemedSurface>
          </View>
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
            disabled={chosen === undefined || (chosen.fields.length > 0 && fields.length === 0) || sending}
            onPress={onShare}
          />
          <ThemedButton
            fullWidth
            variant="secondary"
            label={t('privateExchange.consent.decline')}
            disabled={sending}
            onPress={() => {
              dismissCredentialRequest(request.id);
              onClose();
            }}
          />
          <ThemedText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
            {t('privateExchange.consent.declineNote')}
          </ThemedText>
        </View>
      </ScrollView>
    </View>
  );
}
