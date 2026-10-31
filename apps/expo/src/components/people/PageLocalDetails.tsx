/**
 * Phone, email and note the user adds to someone's saved Page. They live on
 * this phone only (`VerifiedSnapshot.phone/email/note`, outside the signed
 * record), so the section says so — they are never presented as part of the
 * person's own Page.
 */
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalSheet } from '@/components/common/ModalSheet';
import { PressableScale } from '@/components/common/PressableScale';
import { FieldRow, SheetToolbar } from '@/components/people/EditContactSheet';
import { PersonLinksCard, type PersonDetailContactRow } from '@/components/people/personDetailSupport';
import { ThemedButton, ThemedSurface, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import { useProfileSnapshotStore, type VerifiedSnapshot } from '@/people/profileSnapshots';

export function PageLocalDetailsSection({ snapshot }: { readonly snapshot: VerifiedSnapshot }): ReactNode {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const hasAny = snapshot.phone !== null || snapshot.email !== null || snapshot.note !== null;

  return (
    <View style={{ gap: 8 }}>
      {hasAny ? (
        <>
          <View className="flex-row items-center justify-between">
            <ThemedText variant="caption" tone="tertiary">
              {`${t('pageLocalDetails.title')} · ${t('pageLocalDetails.onlyThisPhone')}`}
            </ThemedText>
            <PressableScale
              haptic="tap"
              onPress={() => { setEditing(true); }}
              accessibilityRole="button"
              accessibilityLabel={t('pageLocalDetails.edit')}
              style={{ minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' }}
            >
              <ThemedText variant="label" tone="accent">
                {t('pageLocalDetails.editShort')}
              </ThemedText>
            </PressableScale>
          </View>
          <PersonLinksCard rows={localRows(snapshot)} />
          {snapshot.note !== null ? (
            <ThemedSurface variant="card" className="px-4 py-3">
              <ThemedText variant="bodyMedium" selectable>
                {snapshot.note}
              </ThemedText>
            </ThemedSurface>
          ) : null}
        </>
      ) : (
        <ThemedButton
          fullWidth
          variant="secondary"
          icon="plus"
          label={t('pageLocalDetails.add')}
          onPress={() => { setEditing(true); }}
        />
      )}
      <ModalSheet
        visible={editing}
        presentationStyle="formSheet"
        onRequestClose={() => { setEditing(false); }}
      >
        <LocalDetailsForm
          key={`${snapshot.phone ?? ''}|${snapshot.email ?? ''}|${snapshot.note ?? ''}`}
          snapshot={snapshot}
          onClose={() => { setEditing(false); }}
        />
      </ModalSheet>
    </View>
  );
}

function localRows(snapshot: VerifiedSnapshot): readonly PersonDetailContactRow[] {
  const rows: PersonDetailContactRow[] = [];
  if (snapshot.phone !== null) {
    rows.push({ id: 'phone', icon: 'phone', labelKey: 'personDetail.phone', value: snapshot.phone, url: `tel:${snapshot.phone}` });
  }
  if (snapshot.email !== null) {
    rows.push({ id: 'email', icon: 'envelope', labelKey: 'personDetail.email', value: snapshot.email, url: `mailto:${snapshot.email}` });
  }
  return rows.map((row, index) => ({ ...row, index }));
}

function LocalDetailsForm({
  snapshot,
  onClose,
}: {
  readonly snapshot: VerifiedSnapshot;
  readonly onClose: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const setLocalDetails = useProfileSnapshotStore((s) => s.setLocalDetails);
  const [phone, setPhone] = useState(snapshot.phone ?? '');
  const [email, setEmail] = useState(snapshot.email ?? '');
  const [note, setNote] = useState(snapshot.note ?? '');

  const onSave = (): void => {
    setLocalDetails(snapshot.did, { phone, email, note });
    pushToast(t('personDetail.contactUpdated'), 'success', 2000);
    onClose();
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.pageBg }}>
      <View style={{ paddingTop: insets.top }}>
        <SheetToolbar
          title={snapshot.record.displayName}
          onCancel={onClose}
          onSave={onSave}
          canSave
          saving={false}
        />
      </View>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={16}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: insets.bottom + 32 }}
      >
        <View style={{ rowGap: 20 }}>
          <ThemedText variant="caption" tone="tertiary">
            {t('pageLocalDetails.onlyThisPhone')}
          </ThemedText>
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
            placeholder={t('personDetail.notePlaceholder')}
            value={note}
            onChange={setNote}
            autoCapitalize="sentences"
            multiline
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
