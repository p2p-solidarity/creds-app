/**
 * A privately shared contact from someone not in my People (docs/ref/16 §4).
 * Saving fetches and verifies their Page again (the inbox keeps no copy), and
 * only a Page for the same DID is saved.
 */
import { hexToNpub } from '@solidarity/shared';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { ThemedButton, ThemedSurface, ThemedText } from '@/components/themed';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import { resolveProfileByNpub } from '@/nostr/resolveProfile';
import { useProfileSnapshotStore } from '@/people/profileSnapshots';
import { usePrivateExchangeStore, type ReceivedContactShare } from '@/privateExchange/store';
import { captureLocalDataEpoch } from '@/settings/localDataWipeBarrier';

import { SharedFields } from './ContactShareSection';
import { shortDid } from './PassportConsentSheet';

type SaveState = 'idle' | 'saving' | 'failed';

export function ContactShareInboxItem({ share }: { readonly share: ReceivedContactShare }): ReactNode {
  const { t } = useTranslation();
  const mergeVerified = useProfileSnapshotStore((s) => s.mergeVerified);
  const [save, setSave] = useState<SaveState>('idle');

  const onSave = async (): Promise<void> => {
    setSave('saving');
    const npub = hexToNpub(share.senderHex);
    const resolved = npub.ok ? await resolveProfileByNpub(npub.value) : null;
    if (resolved?.kind !== 'verified' || resolved.record.did !== share.senderDid) {
      setSave('failed');
      return;
    }
    mergeVerified(resolved.record, resolved.jws);
    setSave('idle');
    pushToast(t('privateExchange.contact.savedToPeople', { name: resolved.record.displayName }), 'success');
  };

  const onRemove = (): void => {
    usePrivateExchangeStore.getState().removeContactShare(share.senderDid, captureLocalDataEpoch());
  };

  return (
    <ThemedSurface variant="card" padded style={{ gap: 10 }}>
      <View style={{ gap: 4 }}>
        <ThemedText variant="bodyMedium">
          {t('privateExchange.contact.receivedTitle', {
            name: share.senderName,
            date: new Date(share.sharedAt * 1000).toLocaleDateString(),
          })}
        </ThemedText>
        <ThemedText variant="caption" tone="tertiary" selectable>
          {`${shortDid(share.senderDid)} · ${t('privateExchange.consent.notInPeople')}`}
        </ThemedText>
        <ThemedText variant="caption" tone="tertiary">{t('privateExchange.consent.nameNote')}</ThemedText>
      </View>
      <SharedFields share={share} />
      {save === 'failed' ? (
        <ThemedText variant="bodySmall" tone="error">{t('privateExchange.contact.saveFailed')}</ThemedText>
      ) : null}
      <ThemedButton
        fullWidth
        label={t('privateExchange.contact.saveToPeople')}
        loading={save === 'saving'}
        onPress={() => { void onSave(); }}
      />
      <ThemedButton fullWidth variant="secondary" label={t('privateExchange.contact.remove')} disabled={save === 'saving'} onPress={onRemove} />
    </ThemedSurface>
  );
}
