/**
 * A person whose contact is a saved creds Page — alone, or merged with a
 * manual contact (`VerifiedSnapshot.linkedContactId`). Same chrome as the
 * manual contact detail (`app/people/[id].tsx`): 56pt top bar with share +
 * more, 16pt gutters, sections entering on `fadeUpIn(index)`.
 *
 * Reads the snapshot store by `did` — no PII in the route. A `did` with no
 * saved snapshot renders the honest not-found state.
 */
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Platform, ScrollView, Share, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { buildProfileShareModel } from '@/components/me/meProfileModel';
import { EditContactSheet } from '@/components/people/EditContactSheet';
import { PageLocalDetailsSection } from '@/components/people/PageLocalDetails';
import { PersonMergeSection } from '@/components/people/PersonMergeSection';
import { PersonLinksCard, buildContactRows } from '@/components/people/personDetailSupport';
import { ContactShareSection } from '@/components/privateExchange/ContactShareSection';
import { PassportRequestSection } from '@/components/privateExchange/PassportRequestSection';
import { VerifiedProfileView } from '@/components/scan/VerifiedProfileView';
import { ThemedButton, ThemedSurface, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { useContact, useContactStore } from '@/contacts/repository';
import { confirmDialog } from '@/feedback/confirmDialog';
import { haptic } from '@/feedback/haptics';
import { fadeUpIn } from '@/feedback/motion';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import { safeBack } from '@/navigation/safeBack';
import { useProfileSnapshot, useProfileSnapshotStore } from '@/people/profileSnapshots';
import type { Contact } from '@solidarity/shared';

export default function VerifiedProfileDetailScreen(): ReactNode {
  const { t } = useTranslation();
  const { did } = useLocalSearchParams<{ did: string }>();
  const snapshot = useProfileSnapshot(did);
  const linkedId = snapshot?.linkedContactId ?? undefined;
  const linkedManifest = useContactStore((s) =>
    linkedId ? s.manifest.find((entry) => entry.id === linkedId) : undefined,
  );
  // A link to a contact deleted elsewhere reads as not merged.
  const contact = useContact(linkedManifest ? linkedId : undefined);
  const removePage = useProfileSnapshotStore((s) => s.remove);
  const removeContact = useContactStore((s) => s.remove);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  // The checked creds.id name gives the short link; otherwise the Page's
  // self-contained signed fragment. Not the `#nostr:` pointer: a snapshot
  // that arrived by QR gives no proof the owner ever published it.
  const onShare = (): void => {
    if (!snapshot) return;
    const model = buildProfileShareModel(snapshot.record, snapshot.jws, snapshot.handle ?? '');
    const url = model.usernameUrl ?? model.offlineUrl;
    // iOS: url only — with a message too the sheet counts the same link twice.
    const content = Platform.OS === 'ios' ? { url } : { message: url };
    void Share.share({ title: snapshot.record.displayName, ...content }).catch(() => {
      haptic('error');
      pushToast(t('personDetail.shareFailed'), 'error');
    });
  };

  const onDelete = (): void => {
    if (!snapshot) return;
    void (async () => {
      const ok = await confirmDialog({
        title: t('peopleList.deleteNameTitle', { name: snapshot.record.displayName }),
        message: linkedManifest ? t('peopleList.deleteMergedMessage') : t('peopleList.deleteOnePageMessage'),
        confirmLabel: t('peopleList.delete'),
        destructive: true,
      });
      if (!ok) return;
      try {
        if (!removePage(snapshot)) throw new Error('page delete refused');
        if (linkedManifest) await removeContact(linkedManifest.id);
        haptic('success');
        pushToast(t('peopleList.contactDeleted'), 'success', 2000);
        safeBack();
      } catch {
        haptic('error');
        pushToast(t('peopleList.deleteFailed'), 'error');
      }
    })();
  };

  const sections: ReactNode[] = snapshot
    ? [
        <VerifiedProfileView key="page" record={snapshot.record} username={snapshot.handle} />,
        contact ? <MergedContactSection key="contact" contact={contact} /> : null,
        // Merged: the contact's own fields hold phone/email/note, so the
        // Page's separate local details only show when they already exist.
        !contact || snapshot.phone !== null || snapshot.email !== null || snapshot.note !== null ? (
          <PageLocalDetailsSection key="local" snapshot={snapshot} />
        ) : null,
        <ContactShareSection key="share" record={snapshot.record} />,
        <PassportRequestSection key="passport" record={snapshot.record} />,
        <View key="manage" style={{ gap: 10 }}>
          <PersonMergeSection target={{ kind: 'page', page: snapshot, merged: contact !== undefined }} />
          <ThemedButton
            fullWidth
            variant="destructive"
            label={t('personDetail.deleteContact')}
            onPress={onDelete}
          />
        </View>,
      ].filter((node) => node !== null)
    : [];

  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-3" style={{ height: 56 }}>
        <TopIcon label={t('personDetail.back')} icon="chevron.left" onPress={() => { safeBack(); }} />
        <View style={{ flex: 1 }} />
        {snapshot ? <TopIcon label={t('personDetail.share')} icon="square.and.arrow.up" onPress={onShare} /> : null}
      </View>

      {snapshot ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 16 }}>
          {sections.map((node, index) => (
            <Animated.View key={index} entering={fadeUpIn(index, reduceMotion)}>
              {node}
            </Animated.View>
          ))}
        </ScrollView>
      ) : (
        <View className="flex-1 items-center justify-center gap-2 px-8">
          <SfIcon name="questionmark.circle" size={32} color={Colors.text3} />
          <ThemedText variant="bodyMedium" tone="secondary" style={{ textAlign: 'center' }}>
            {t('verifiedPage.notFound')}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

function TopIcon({
  label,
  icon,
  onPress,
}: {
  readonly label: string;
  readonly icon: 'chevron.left' | 'square.and.arrow.up';
  readonly onPress: () => void;
}): ReactNode {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <SfIcon name={icon} size={icon === 'chevron.left' ? 24 : 20} color={Colors.text1} />
    </PressableScale>
  );
}

/** What the user typed for this person before merging: kept on this phone,
 *  never shown as part of their signed Page. */
function MergedContactSection({ contact }: { readonly contact: Contact }): ReactNode {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const rows = useMemo(() => buildContactRows(contact), [contact]);
  const work = [contact.businessCard.title, contact.businessCard.company]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .join(' · ');
  const note = contact.notes?.trim();

  return (
    <View style={{ gap: 8 }}>
      <View className="flex-row items-center justify-between">
        <ThemedText variant="caption" tone="tertiary">
          {t('peopleMerge.yourDetails')}
        </ThemedText>
        <PressableScale
          haptic="tap"
          onPress={() => { setEditing(true); }}
          accessibilityRole="button"
          accessibilityLabel={t('personDetail.editContact')}
          style={{ minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <ThemedText variant="label" tone="accent">
            {t('pageLocalDetails.editShort')}
          </ThemedText>
        </PressableScale>
      </View>
      {work.length > 0 || note ? (
        <ThemedSurface variant="card" className="px-4 py-3" style={{ gap: 4 }}>
          {work.length > 0 ? <ThemedText variant="bodyMedium">{work}</ThemedText> : null}
          {note ? (
            <ThemedText variant="bodySmall" tone="secondary" selectable>
              {note}
            </ThemedText>
          ) : null}
        </ThemedSurface>
      ) : null}
      <PersonLinksCard rows={rows} />
      <EditContactSheet visible={editing} contact={contact} onClose={() => { setEditing(false); }} />
    </View>
  );
}
