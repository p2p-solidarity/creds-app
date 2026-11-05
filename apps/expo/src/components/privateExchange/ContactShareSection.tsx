/**
 * Private contact sharing on a saved Page (docs/ref/16 P2, §4): what this
 * person shared with me — kept apart from my own notes, copied in only when I
 * tap — and a sheet to share my phone / email / note with them.
 */
import type { ProfileRecord } from '@solidarity/shared';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalSheet } from '@/components/common/ModalSheet';
import { FieldRow } from '@/components/people/EditContactSheet';
import { PersonLinksCard, type PersonDetailContactRow } from '@/components/people/personDetailSupport';
import { ThemedButton, ThemedSurface, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { confirmDialog } from '@/feedback/confirmDialog';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import { getProfileSnapshot, useProfileSnapshotStore } from '@/people/profileSnapshots';
import { shareContactDetails } from '@/privateExchange/contactShare';
import { recipientHexOf } from '@/privateExchange/send';
import type { ReceivedContactShare } from '@/privateExchange/store';

import { useContactSentAt, useContactShareDraft, useContactShareFrom } from './usePrivateExchange';

export function ContactShareSection({ record }: { readonly record: ProfileRecord }): ReactNode {
  const { t } = useTranslation();
  const share = useContactShareFrom(record.did);
  const sentAt = useContactSentAt(record.did);
  const [sharing, setSharing] = useState(false);
  const reachable = recipientHexOf(record) !== null;

  return (
    <View style={{ gap: 8 }}>
      <ThemedText variant="caption" tone="tertiary">{t('privateExchange.contact.sectionTitle')}</ThemedText>
      {share === undefined ? null : <ReceivedShareCard share={share} />}
      {reachable ? (
        <>
          <ThemedButton
            fullWidth
            variant="secondary"
            icon="lock"
            label={t('privateExchange.contact.button')}
            onPress={() => { setSharing(true); }}
          />
          {sentAt === undefined ? null : (
            <ThemedText variant="caption" tone="tertiary">
              {t('privateExchange.contact.sentAt', { date: new Date(sentAt * 1000).toLocaleDateString() })}
            </ThemedText>
          )}
        </>
      ) : (
        <ThemedText variant="bodySmall" tone="tertiary">
          {t('privateExchange.contact.notOnNostr', { name: record.displayName })}
        </ThemedText>
      )}
      <ModalSheet visible={sharing} presentationStyle="formSheet" onRequestClose={() => { setSharing(false); }}>
        <ShareForm record={record} onClose={() => { setSharing(false); }} />
      </ModalSheet>
    </View>
  );
}

export function contactRows(share: ReceivedContactShare): readonly PersonDetailContactRow[] {
  const rows: PersonDetailContactRow[] = [];
  if (share.phone !== undefined) {
    rows.push({ id: 'phone', icon: 'phone', labelKey: 'personDetail.phone', value: share.phone, url: `tel:${share.phone}` });
  }
  if (share.email !== undefined) {
    rows.push({ id: 'email', icon: 'envelope', labelKey: 'personDetail.email', value: share.email, url: `mailto:${share.email}` });
  }
  return rows.map((row, index) => ({ ...row, index }));
}

/** The shared fields, as they arrived. */
export function SharedFields({ share }: { readonly share: ReceivedContactShare }): ReactNode {
  return (
    <>
      {share.phone !== undefined || share.email !== undefined ? <PersonLinksCard rows={contactRows(share)} /> : null}
      {share.note === undefined ? null : (
        <ThemedSurface variant="card" className="px-4 py-3">
          <ThemedText variant="bodyMedium" selectable>{share.note}</ThemedText>
        </ThemedSurface>
      )}
    </>
  );
}

function ReceivedShareCard({ share }: { readonly share: ReceivedContactShare }): ReactNode {
  const { t } = useTranslation();
  const setLocalDetails = useProfileSnapshotStore((s) => s.setLocalDetails);

  const onCopy = async (): Promise<void> => {
    const mine = getProfileSnapshot(share.senderDid);
    if (mine === undefined) return;
    const next = {
      phone: share.phone ?? mine.phone,
      email: share.email ?? mine.email,
      note: share.note ?? mine.note,
    };
    const replaces =
      (mine.phone !== null && mine.phone !== next.phone) ||
      (mine.email !== null && mine.email !== next.email) ||
      (mine.note !== null && mine.note !== next.note);
    if (replaces) {
      const ok = await confirmDialog({
        title: t('privateExchange.contact.replaceTitle'),
        message: t('privateExchange.contact.replaceBody'),
        confirmLabel: t('privateExchange.contact.replaceConfirm'),
      });
      if (!ok) return;
    }
    setLocalDetails(share.senderDid, next);
    pushToast(t('privateExchange.contact.copied'), 'success', 2000);
  };

  return (
    <View style={{ gap: 8 }}>
      <ThemedText variant="label" tone="secondary">
        {t('privateExchange.contact.receivedTitle', {
          name: share.senderName,
          date: new Date(share.sharedAt * 1000).toLocaleDateString(),
        })}
      </ThemedText>
      <SharedFields share={share} />
      <ThemedButton variant="secondary" label={t('privateExchange.contact.copy')} onPress={() => { void onCopy(); }} />
    </View>
  );
}

function ShareForm({ record, onClose }: { readonly record: ProfileRecord; readonly onClose: () => void }): ReactNode {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const draft = useContactShareDraft();
  const [phone, setPhone] = useState(draft?.phone ?? '');
  const [email, setEmail] = useState(draft?.email ?? '');
  const [note, setNote] = useState(draft?.note ?? '');
  const [sending, setSending] = useState(false);
  // Inline, not a toast: the toast overlay renders under this native sheet.
  const [failure, setFailure] = useState<string | null>(null);
  const empty = phone.trim() === '' && email.trim() === '' && note.trim() === '';

  const onSend = (): void => {
    setSending(true);
    setFailure(null);
    void shareContactDetails(record, { phone, email, note })
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
            <ThemedText variant="titleLarge">{t('privateExchange.contact.title', { name: record.displayName })}</ThemedText>
            <ThemedText variant="bodyMedium" tone="secondary">{t('privateExchange.contact.body')}</ThemedText>
          </View>
          <FieldRow
            label={t('personDetail.phone')}
            placeholder={t('pageLocalDetails.optional')}
            value={phone}
            onChange={setPhone}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
          <FieldRow
            label={t('personDetail.email')}
            placeholder={t('pageLocalDetails.optional')}
            value={email}
            onChange={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <FieldRow
            label={t('personDetail.noteLabel')}
            placeholder={t('pageLocalDetails.optional')}
            value={note}
            onChange={setNote}
            autoCapitalize="sentences"
            multiline
          />
          <ThemedText variant="bodySmall" tone="tertiary">{t('privateExchange.privacyNote')}</ThemedText>
          {failure === null ? null : (
            <ThemedText variant="bodySmall" tone="error" accessibilityLiveRegion="polite">{failure}</ThemedText>
          )}
          <ThemedButton
            fullWidth
            icon="faceid"
            label={t('privateExchange.consent.share')}
            loading={sending}
            disabled={empty || sending}
            onPress={onSend}
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
