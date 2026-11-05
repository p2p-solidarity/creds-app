/**
 * Merge / unmerge on a person's detail screen. A saved Page merges with a
 * manual contact (and the other way round); the link is all that changes —
 * unmerging gives both back exactly as they were.
 */
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalSheet } from '@/components/common/ModalSheet';
import { SheetToolbar } from '@/components/people/EditContactSheet';
import { PersonRow } from '@/components/people/PersonRow';
import { ThemedButton, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { confirmDialog } from '@/feedback/confirmDialog';
import { haptic } from '@/feedback/haptics';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import { sameNameKey, usePeople, type Person } from '@/people/person';
import { useProfileSnapshotStore, type VerifiedSnapshot } from '@/people/profileSnapshots';

export type PersonMergeTarget =
  | { readonly kind: 'page'; readonly page: VerifiedSnapshot; readonly merged: boolean }
  | { readonly kind: 'contact'; readonly contactId: string; readonly name: string };

export function PersonMergeSection({ target }: { readonly target: PersonMergeTarget }): ReactNode {
  const { t } = useTranslation();
  const linkContact = useProfileSnapshotStore((s) => s.linkContact);
  const [picking, setPicking] = useState(false);

  if (target.kind === 'page' && target.merged) {
    return (
      <ThemedButton
        fullWidth
        variant="secondary"
        label={t('peopleMerge.unmerge')}
        onPress={() => {
          void (async () => {
            const ok = await confirmDialog({
              title: t('peopleMerge.unmergeTitle'),
              message: t('peopleMerge.unmergeMessage'),
              confirmLabel: t('peopleMerge.unmerge'),
            });
            if (!ok) return;
            linkContact(target.page.did, null);
            pushToast(t('peopleMerge.unmerged'), 'success', 2000);
          })();
        }}
      />
    );
  }

  return (
    <>
      <ThemedButton
        fullWidth
        variant="secondary"
        icon="person.2"
        label={target.kind === 'page' ? t('peopleMerge.mergeWithContact') : t('peopleMerge.mergeWithPage')}
        onPress={() => { setPicking(true); }}
      />
      <ModalSheet visible={picking} presentationStyle="formSheet" onRequestClose={() => { setPicking(false); }}>
        <MergePicker
          target={target}
          onClose={() => { setPicking(false); }}
          onPick={(person) => {
            void (async () => {
              const page = target.kind === 'page' ? target.page : person.page;
              const contactId = target.kind === 'contact' ? target.contactId : person.contact?.id;
              if (!page || !contactId) return;
              const ok = await confirmDialog({
                title: t('peopleMerge.confirmTitle'),
                message: t('peopleMerge.confirmMessage', { page: page.record.displayName }),
                confirmLabel: t('peopleMerge.merge'),
              });
              if (!ok) return;
              linkContact(page.did, contactId);
              haptic('success');
              pushToast(t('peopleMerge.merged'), 'success', 2000);
              setPicking(false);
              if (target.kind === 'contact') {
                router.replace({ pathname: '/people/profile/[did]', params: { did: page.did } });
              }
            })();
          }}
        />
      </ModalSheet>
    </>
  );
}

function MergePicker({
  target,
  onClose,
  onPick,
}: {
  readonly target: PersonMergeTarget;
  readonly onClose: () => void;
  readonly onPick: (person: Person) => void;
}): ReactNode {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const people = usePeople();
  const ownName = sameNameKey(target.kind === 'page' ? target.page.record.displayName : target.name);
  // The other kind only, unmerged; same full name first.
  const candidates = useMemo(
    () =>
      people
        .filter((p) => (target.kind === 'page' ? p.contact !== null && p.page === null : p.page !== null && p.contact === null))
        .sort((a, b) => Number(sameNameKey(b.name) === ownName) - Number(sameNameKey(a.name) === ownName)),
    [people, target.kind, ownName],
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.pageBg }}>
      <View style={{ paddingTop: insets.top }}>
        <SheetToolbar
          title={target.kind === 'page' ? t('peopleMerge.pickContact') : t('peopleMerge.pickPage')}
          onCancel={onClose}
        />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
        <ThemedText variant="bodySmall" tone="secondary" style={{ paddingVertical: 12 }}>
          {t('peopleMerge.pickHint')}
        </ThemedText>
        {candidates.length === 0 ? (
          <ThemedText variant="bodyMedium" tone="secondary" style={{ paddingVertical: 24, textAlign: 'center' }}>
            {target.kind === 'page' ? t('peopleMerge.noContacts') : t('peopleMerge.noPages')}
          </ThemedText>
        ) : (
          candidates.map((person) => (
            <PersonRow
              key={person.key}
              person={person}
              selectionMode={false}
              selected={false}
              onPress={() => { onPick(person); }}
              onLongPress={() => { onPick(person); }}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}
