/**
 * Private inbox (docs/ref/16 §4): passport requests other creds users sent
 * over NIP-17 (tapping one opens the consent sheet), and contact details
 * shared by people not yet in my People.
 */
import type { ReactNode } from 'react';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { ContactShareInboxItem } from '@/components/privateExchange/ContactShareInboxItem';
import { CredentialConsentSheet } from '@/components/privateExchange/CredentialConsentSheet';
import { PassportConsentSheet, shortDid } from '@/components/privateExchange/PassportConsentSheet';
import {
  usePendingCredentialIncoming,
  usePendingIncoming,
  usePrivateInboxSync,
  useUnsavedContactShares,
} from '@/components/privateExchange/usePrivateExchange';
import { ThemedSurface, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { useTranslation } from '@/i18n';
import { safeBack } from '@/navigation/safeBack';
import type { IncomingCredentialRequest, IncomingPassportRequest } from '@/privateExchange/store';

export default function PrivateInboxScreen(): ReactNode {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const sync = usePrivateInboxSync();
  const pending = usePendingIncoming();
  const shares = useUnsavedContactShares();
  const credentialRequests = usePendingCredentialIncoming();
  const [open, setOpen] = useState<IncomingPassportRequest | null>(null);
  const [openCredential, setOpenCredential] = useState<IncomingCredentialRequest | null>(null);

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
        <ThemedText variant="titleMedium" style={{ flex: 1 }}>{t('privateExchange.inbox.title')}</ThemedText>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 32, gap: 12 }}>
        {sync === 'noKey' ? (
          <ThemedText variant="bodyMedium" tone="secondary">{t('privateExchange.inbox.noKey')}</ThemedText>
        ) : null}
        {sync === 'unreachable' ? (
          <ThemedText variant="bodyMedium" tone="error">{t('privateExchange.inbox.unreachable')}</ThemedText>
        ) : null}

        {pending.length === 0 && shares.length === 0 && credentialRequests.length === 0 ? (
          sync === 'syncing' ? (
            <ThemedText variant="bodyMedium" tone="secondary">{t('privateExchange.inbox.syncing')}</ThemedText>
          ) : sync === 'idle' ? (
            <ThemedText variant="bodyMedium" tone="secondary">{t('privateExchange.inbox.empty')}</ThemedText>
          ) : null
        ) : pending.length === 0 ? null : (
          <ThemedSurface variant="card" style={{ overflow: 'hidden' }}>
            {pending.map((request, index) => (
              <PressableScale
                key={request.id}
                onPress={() => { setOpen(request); }}
                accessibilityRole="button"
                className="flex-row items-center gap-3 px-4 py-3"
                style={{ minHeight: 60, borderTopWidth: index === 0 ? 0 : 0.5, borderTopColor: Colors.divider }}
              >
                <SfIcon name="lock" size={16} color={Colors.primaryBlue} />
                <View style={{ flex: 1, gap: 2 }}>
                  <ThemedText variant="bodyMedium">{t('privateExchange.consent.title', { name: request.senderName })}</ThemedText>
                  <ThemedText variant="caption" tone="tertiary">
                    {request.claims.map((c) => t(`privateExchange.claim.${c}`)).join('、')} · {shortDid(request.senderDid)}
                  </ThemedText>
                </View>
                <SfIcon name="chevron.right" size={12} color={Colors.text3} />
              </PressableScale>
            ))}
          </ThemedSurface>
        )}

        {credentialRequests.length === 0 ? null : (
          <ThemedSurface variant="card" style={{ overflow: 'hidden' }}>
            {credentialRequests.map((request, index) => (
              <PressableScale
                key={request.id}
                onPress={() => { setOpenCredential(request); }}
                accessibilityRole="button"
                className="flex-row items-center gap-3 px-4 py-3"
                style={{ minHeight: 60, borderTopWidth: index === 0 ? 0 : 0.5, borderTopColor: Colors.divider }}
              >
                <SfIcon name="lock" size={16} color={Colors.primaryBlue} />
                <View style={{ flex: 1, gap: 2 }}>
                  <ThemedText variant="bodyMedium">{t('privateExchange.credential.consentTitle', { name: request.senderName })}</ThemedText>
                  <ThemedText variant="caption" tone="tertiary" numberOfLines={1}>
                    {request.purpose === null ? shortDid(request.senderDid) : `${request.purpose} · ${shortDid(request.senderDid)}`}
                  </ThemedText>
                </View>
                <SfIcon name="chevron.right" size={12} color={Colors.text3} />
              </PressableScale>
            ))}
          </ThemedSurface>
        )}

        {shares.map((share) => (
          <ContactShareInboxItem key={share.senderDid} share={share} />
        ))}

        <ThemedText variant="caption" tone="tertiary">{t('privateExchange.inbox.openAppNote')}</ThemedText>
      </ScrollView>

      <PassportConsentSheet request={open} onClose={() => { setOpen(null); }} />
      <CredentialConsentSheet request={openCredential} onClose={() => { setOpenCredential(null); }} />
    </View>
  );
}
