/** Contacts tab — creds mock v3, backed only by persisted contact data. */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, View, type RefreshControlProps } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import ReanimatedSwipeable, {
  SwipeDirection,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGestureAutoBackup } from '@/backup';
import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { PeopleFeatureArt } from '@/components/decor/CredsFeatureArt';
import { ContactsAddSheet } from '@/components/people/ContactsAddSheet';
import { ContactsActivitySections } from '@/components/people/ContactsActivitySections';
import {
  ContactSectionHeader,
  flattenContactSections,
  groupContactsByInitial,
} from '@/components/people/ContactsList';
import { DeleteContactsSheet } from '@/components/people/DeleteContactsSheet';
import { ManualContactEntrySheet } from '@/components/people/ManualContactEntrySheet';
import { PeopleSearchField } from '@/components/people/PeopleSearchField';
import { TrustGraphContactRow } from '@/components/people/TrustGraphContactRow';
import { SavedPageRow } from '@/components/people/SavedPageRow';
import { LinkPageImportSheet, type LinkPageImportResult } from '@/components/profile/LinkPageImportSheet';
import { ThemedButton, ThemedSurface, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { Radius } from '@/constants/radius';
import { useThemeColors } from '@/constants/useThemeColors';
import { useTranslation } from '@/i18n';
import { useContactStore, type ContactManifestEntry } from '@/contacts/repository';
import { shareContactVCard } from '@/contacts/shareContactVCard';
import { confirmDialog } from '@/feedback/confirmDialog';
import { haptic } from '@/feedback/haptics';
import { fadeUpIn } from '@/feedback/motion';
import { pushToast } from '@/feedback/toast';
import { useProfileSnapshotStore, useSortedProfileSnapshots } from '@/people/profileSnapshots';
import { usePagesPullRefresh } from '@/people/usePagesPullRefresh';
import { usePeopleScreen } from '@/people/usePeopleScreen';
import { usePreferences } from '@/settings/preferences';

/** Rows (headers included) that cascade in when the list first paints — about
 *  one screenful. Everything below the fold, and every recycled cell, just
 *  appears: a stagger nobody can see only delays the list. */
const ENTRANCE_ROWS = 10;

export default function PeopleTab() {
  const { t } = useTranslation();
  const { contacts, loading, error, refresh, retry } = usePeopleScreen();
  const removeContact = useContactStore((s) => s.remove);
  const loadDetail = useContactStore((s) => s.loadDetail);
  const upsertDeclared = useProfileSnapshotStore((s) => s.upsertDeclared);
  const savedPages = useSortedProfileSnapshots();
  const savedPageCount = savedPages.length;
  const pullRefresh = usePagesPullRefresh(savedPageCount);
  const backupEnabled = usePreferences((s) => s.backupEnabled);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { edit } = useLocalSearchParams<{ edit?: string }>();

  const [searchQuery, setSearchQuery] = useState('');
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [manualSheetOpen, setManualSheetOpen] = useState(false);
  const [linkPageSheetOpen, setLinkPageSheetOpen] = useState(false);
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

  const contactSections = useMemo(() => groupContactsByInitial(contacts, ''), [contacts]);
  const orderedContacts = useMemo(
    () => contactSections.flatMap((section) =>
      section.entries.flatMap((entry) => (entry.kind === 'contact' ? [entry.contact] : []))),
    [contactSections],
  );
  const filteredSections = useMemo(
    // Selecting acts on contacts only (delete / export vCard), so saved Pages
    // leave the list while selecting.
    () => groupContactsByInitial(contacts, searchQuery, editMode ? [] : savedPages),
    [contacts, searchQuery, editMode, savedPages],
  );
  const filteredCount = useMemo(
    () => filteredSections.reduce((count, section) => count + section.entries.length, 0),
    [filteredSections],
  );
  const searching = searchQuery.trim().length > 0;
  const filteredListItems = useMemo(
    () => flattenContactSections(filteredSections, !searching),
    [filteredSections, searching],
  );
  const selectedContacts = useMemo(
    () => orderedContacts.filter((contact) => selectedIds.has(contact.id)),
    [orderedContacts, selectedIds],
  );

  useEffect(() => {
    if (edit === '1' && orderedContacts.length > 0) setEditMode(true);
  }, [edit, orderedContacts.length]);

  const exitEditMode = () => {
    setEditMode(false);
    setSelectedIds(new Set());
  };

  const onSelectContact = (c: ContactManifestEntry) => {
    if (editMode) {
      toggleSelected(c.id);
      return;
    }
    router.push({
      pathname: '/people/[id]',
      params: { id: c.id, name: c.name },
    });
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onLongPressContact = (c: ContactManifestEntry) => {
    // The row owns the long-press haptic; this handler owns selection state.
    if (!editMode) {
      setEditMode(true);
      setSelectedIds(new Set([c.id]));
      return;
    }
    toggleSelected(c.id);
  };

  const onDeleteContact = (c: ContactManifestEntry) => {
    void (async () => {
      const ok = await confirmDialog({
        title: t('peopleList.deleteNameTitle', { name: c.name }),
        message: t('peopleList.deleteOneMessage'),
        confirmLabel: t('peopleList.delete'),
        destructive: true,
      });
      if (!ok) return;
      try {
        await removeContact(c.id);
        haptic('success');
        refresh();
      } catch {
        haptic('error');
        pushToast(t('peopleList.deleteFailed'), 'error');
      }
    })();
  };

  const onBatchDelete = (): void => {
    if (selectedContacts.length === 0) return;
    setDeleteSheetOpen(true);
  };

  const confirmBatchDelete = (): void => {
    const ids = selectedContacts.map((contact) => contact.id);
    if (deleting || ids.length === 0) return;
    setDeleting(true);
    void (async () => {
      try {
        for (const id of ids) {
          await removeContact(id);
        }
        haptic('success');
        pushToast(
          ids.length === 1
            ? t('peopleList.contactDeleted')
            : t('peopleList.deletedCount', { count: ids.length }),
          'success',
          2000,
        );
        setDeleteSheetOpen(false);
        exitEditMode();
        refresh();
      } catch {
        pushToast(t('peopleList.deleteFailed'), 'error');
      } finally {
        setDeleting(false);
      }
    })();
  };

  const onExportVCard = (): void => {
    if (exporting || selectedIds.size === 0) return;
    const ids = orderedContacts
      .filter((contact) => selectedIds.has(contact.id))
      .map((contact) => contact.id);
    setExporting(true);
    void (async () => {
      try {
        await shareContactVCard(ids, loadDetail, t('peopleList.exportVCard'));
        pushToast(t('peopleList.exported', { count: ids.length }), 'success', 2000);
        exitEditMode();
      } catch {
        pushToast(t('peopleList.exportFailed'), 'error');
      } finally {
        setExporting(false);
      }
    })();
  };

  const backupGesture = useGestureAutoBackup({
    onComplete: () => { pushToast(t('peopleList.backedUp'), 'success', 2000); },
    onError: () => { pushToast(t('peopleList.backupFailed'), 'error'); },
  });

  const body = (
    <View className="flex-1">
      <ContactsHeader
        editMode={editMode}
        hasContacts={orderedContacts.length > 0}
        allSelected={
          orderedContacts.length > 0 &&
          orderedContacts.every((contact) => selectedIds.has(contact.id))
        }
        onAdd={() => { setAddSheetOpen(true); }}
        onEnterEditMode={() => { setEditMode(true); }}
        onExitEditMode={exitEditMode}
        onToggleSelectAll={() => {
          setSelectedIds((prev) => {
            const allSelected =
              orderedContacts.length > 0 &&
              orderedContacts.every((contact) => prev.has(contact.id));
            if (allSelected) return new Set();
            return new Set(orderedContacts.map((contact) => contact.id));
          });
        }}
      />

      <ContactsAddSheet
        visible={addSheetOpen}
        onClose={() => { setAddSheetOpen(false); }}
        onScan={() => { router.push('/scan'); }}
        onEnterManually={() => { setManualSheetOpen(true); }}
        onImportPhone={() => { router.push('/contacts/import-phone'); }}
        onImportVcf={() => { router.push('/contacts/import-vcf'); }}
        onImportPage={() => { setLinkPageSheetOpen(true); }}
      />

      <ManualContactEntrySheet
        visible={manualSheetOpen}
        onClose={() => { setManualSheetOpen(false); }}
        onSaved={() => { refresh(); }}
      />

      <LinkPageImportSheet
        visible={linkPageSheetOpen}
        title={t('peopleList.pasteLinkPage')}
        confirmLabel={t('peopleList.declaredImportConfirm')}
        onClose={() => { setLinkPageSheetOpen(false); }}
        onImport={(result: LinkPageImportResult) => {
          const snapshot = upsertDeclared(result.sourceUrl, result.title, result.links);
          haptic('success');
          pushToast(t('peopleList.declaredSaved'), 'success');
          router.push({ pathname: '/people/declared/[id]', params: { id: snapshot.id } });
        }}
      />

      <DeleteContactsSheet
        visible={deleteSheetOpen}
        contacts={selectedContacts}
        deleting={deleting}
        onConfirm={confirmBatchDelete}
        onClose={() => { setDeleteSheetOpen(false); }}
      />

      {error ? (
        <ContactsLoadError onRetry={retry} />
      ) : loading ? (
        <LoadingState />
      ) : contacts.length === 0 && savedPageCount === 0 ? (
        <EmptyContactsContent
          onImportPhone={() => { router.push('/contacts/import-phone'); }}
          onAdd={() => { setAddSheetOpen(true); }}
          activity={editMode ? null : <ContactsActivitySections onContactAdded={refresh} />}
          refreshControl={pullRefresh}
        />
      ) : (
        <>
          {/* Search bar stays mounted whenever there is data so the input
              doesn't flicker in/out as users type past their last match. */}
          {!editMode ? (
            <View className="px-4 pb-3">
              <PeopleSearchField value={searchQuery} onChangeText={setSearchQuery} />
            </View>
          ) : null}
          {!editMode && !searching ? <ContactsActivitySections onContactAdded={refresh} /> : null}
          {filteredCount === 0 ? (
            <View style={{ flex: 1, paddingHorizontal: 16 }}>
              <EmptySearchState
                query={searchQuery}
                onAdd={() => { setAddSheetOpen(true); }}
                onImportPhone={() => { router.push('/contacts/import-phone'); }}
              />
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <FlashList
                data={filteredListItems}
                keyExtractor={(item) => item.key}
                getItemType={(item) => item.kind}
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  paddingBottom: editMode ? 100 : 16,
                }}
                keyboardShouldPersistTaps="handled"
                refreshControl={editMode ? undefined : pullRefresh}
                extraData={{ editMode, selectedIds }}
                renderItem={({ item, index }) => (
                  // Always wrapped, so a recycled cell keeps the same tree;
                  // `entering` only runs on mount, never on recycle.
                  <Animated.View
                    entering={index < ENTRANCE_ROWS ? fadeUpIn(index, reduceMotion) : undefined}>
                    {item.kind === 'header' ? (
                      <ContactSectionHeader title={item.title} />
                    ) : item.kind === 'page' ? (
                      <SavedPageRow snapshot={item.snapshot} />
                    ) : (
                      <PeopleRow
                        contact={item.contact}
                        editMode={editMode}
                        selected={selectedIds.has(item.contact.id)}
                        onPress={() => { onSelectContact(item.contact); }}
                        onLongPress={() => { onLongPressContact(item.contact); }}
                        onSwipeDelete={() => { onDeleteContact(item.contact); }}
                      />
                    )}
                  </Animated.View>
                )}
              />
            </View>
          )}
          {editMode ? (
            <BatchActionBar
              count={selectedIds.size}
              onDelete={onBatchDelete}
              onExport={onExportVCard}
              exporting={exporting}
            />
          ) : null}
        </>
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      {backupEnabled ? (
        <GestureDetector gesture={backupGesture}>{body}</GestureDetector>
      ) : (
        body
      )}
    </View>
  );
}

/**
 * PeopleRow — adds swipe-to-delete around the v3 selection-aware row.
 *
 * Swipe is disabled while edit mode is active so the gesture doesn't fight
 * the multi-select tap target. Long-press still enters edit mode.
 */
function PeopleRow({
  contact,
  editMode,
  selected,
  onPress,
  onLongPress,
  onSwipeDelete,
}: {
  readonly contact: ContactManifestEntry;
  readonly editMode: boolean;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly onLongPress: () => void;
  readonly onSwipeDelete: () => void;
}) {
  const c = useThemeColors();
  const inner = (
    <TrustGraphContactRow
      contact={contact}
      selectionMode={editMode}
      selected={selected}
      onPress={onPress}
      onLongPress={onLongPress}
    />
  );

  if (editMode) return inner;

  return (
    <ReanimatedSwipeable
      // The delete action fills the row from behind; an opaque row hides it
      // until a swipe slides the row aside.
      childrenContainerStyle={{ backgroundColor: c.pageBg }}
      friction={2}
      rightThreshold={48}
      overshootRight={false}
      renderRightActions={(progress) => (
        <SwipeDeleteAction progress={progress} onPress={onSwipeDelete} />
      )}
      onSwipeableOpen={(direction) => {
        if (direction === SwipeDirection.RIGHT) haptic('warning');
      }}
    >
      {inner}
    </ReanimatedSwipeable>
  );
}

/** Width the row slides aside to uncover the delete button. */
const SWIPE_ACTION_WIDTH = 84;

/**
 * The swipe's delete button: an inset rounded tile (not a full-height red
 * slab) that grows in with the swipe, so a half swipe reads as a hint and a
 * full one as the button.
 */
function SwipeDeleteAction({
  progress,
  onPress,
}: {
  readonly progress: SharedValue<number>;
  readonly onPress: () => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const reveal = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0.6, 1], 'clamp'),
    transform: [{ scale: reduceMotion ? 1 : interpolate(progress.value, [0, 1], [0.82, 1], 'clamp') }],
  }));
  return (
    <View style={{ width: SWIPE_ACTION_WIDTH, paddingVertical: 6, paddingLeft: 6, paddingRight: 16 }}>
      <Animated.View style={[{ flex: 1 }, reveal]}>
        <PressableScale
          fill
          haptic="warning"
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={t('peopleList.deleteContactA11y')}
          style={{
            flex: 1,
            borderRadius: Radius.card,
            backgroundColor: Colors.destructive,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
          }}
        >
          <SfIcon name="trash" size={17} color={Colors.invertedButtonText} />
          <ThemedText variant="caption" style={{ color: Colors.invertedButtonText, fontSize: 11 }}>
            {t('peopleList.delete')}
          </ThemedText>
        </PressableScale>
      </Animated.View>
    </View>
  );
}

function BatchActionBar({
  count,
  onDelete,
  onExport,
  exporting,
}: {
  readonly count: number;
  readonly onDelete: () => void;
  readonly onExport: () => void;
  readonly exporting: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 16,
      }}
    >
      <ThemedSurface
        variant="elevated"
        className="flex-row items-center p-3"
        style={{ gap: 8 }}
      >
        <ThemedText
          variant="bodySmall"
          tabularNums
          numberOfLines={1}
          style={{ flex: 1 }}
        >
          {t('peopleList.countSelected', { count })}
        </ThemedText>
        <ThemedButton
          size="md"
          variant="destructive"
          label={t('peopleList.delete')}
          disabled={count === 0 || exporting}
          onPress={onDelete}
        />
        <ThemedButton
          size="md"
          label={t('peopleList.exportVCard')}
          loading={exporting}
          disabled={count === 0}
          onPress={onExport}
        />
      </ThemedSurface>
    </View>
  );
}

function ContactsHeader({
  editMode,
  hasContacts,
  allSelected,
  onAdd,
  onEnterEditMode,
  onExitEditMode,
  onToggleSelectAll,
}: {
  readonly editMode: boolean;
  readonly hasContacts: boolean;
  readonly allSelected: boolean;
  readonly onAdd: () => void;
  readonly onEnterEditMode: () => void;
  readonly onExitEditMode: () => void;
  readonly onToggleSelectAll: () => void;
}) {
  const { t } = useTranslation();

  if (!editMode) {
    return (
      <View className="flex-row items-center px-4" style={{ height: 56 }}>
        <HeaderAction
          label={t('peopleList.select')}
          onPress={onEnterEditMode}
          disabled={!hasContacts}
          align="left"
        />
        <ThemedText
          variant="titleMedium"
          accessibilityRole="header"
          numberOfLines={1}
          style={{ flex: 1, textAlign: 'center' }}
        >
          {t('peopleList.title')}
        </ThemedText>
        <HeaderAction
          label={t('peopleList.add')}
          onPress={onAdd}
          align="right"
          icon="plus"
        />
      </View>
    );
  }

  return (
    <View className="flex-row items-center px-4" style={{ height: 56 }}>
      <HeaderAction
        label={t('peopleList.done')}
        onPress={onExitEditMode}
        align="left"
      />
      <ThemedText
        variant="titleMedium"
        accessibilityRole="header"
        numberOfLines={1}
        style={{ flex: 1, textAlign: 'center' }}
      >
        {t('peopleList.title')}
      </ThemedText>
      <HeaderAction
        label={allSelected ? t('peopleList.deselectAll') : t('peopleList.selectAll')}
        onPress={onToggleSelectAll}
        disabled={!hasContacts}
        align="right"
      />
    </View>
  );
}

function HeaderAction({
  label,
  onPress,
  disabled = false,
  align,
  icon,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly align: 'left' | 'right';
  readonly icon?: 'plus';
}) {
  return (
    <PressableScale
      haptic="tap"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 96,
        minHeight: 44,
        justifyContent: 'center',
        alignItems: align === 'left' ? 'flex-start' : 'flex-end',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {icon === 'plus' ? (
        <SfIcon name="plus" size={20} color={Colors.primaryBlue} />
      ) : (
        <ThemedText variant="bodyMedium" numberOfLines={1}>
          {label}
        </ThemedText>
      )}
    </PressableScale>
  );
}

function EmptyContactsContent({
  onImportPhone,
  onAdd,
  activity,
  refreshControl,
}: {
  readonly onImportPhone: () => void;
  readonly onAdd: () => void;
  readonly activity: ReactNode;
  readonly refreshControl: ReactElement<RefreshControlProps> | undefined;
}) {
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl}>
      {activity}
      <EmptyState onImportPhone={onImportPhone} onAdd={onAdd} />
    </ScrollView>
  );
}

function EmptyState({
  onImportPhone,
  onAdd,
}: {
  readonly onImportPhone: () => void;
  readonly onAdd: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      style={{
        flex: 1,
        minHeight: 420,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        paddingVertical: 32,
        gap: 14,
      }}
    >
      <View
        style={{ width: 160, height: 160, alignItems: 'center', justifyContent: 'center' }}
      >
        <PeopleFeatureArt size={160} />
      </View>
      <ThemedText variant="titleLarge" style={{ textAlign: 'center' }}>
        {t('peopleList.emptyTitle')}
      </ThemedText>
      <ThemedText variant="bodyMedium" tone="secondary" style={{ textAlign: 'center' }}>
        {t('peopleList.emptyBody')}
      </ThemedText>
      <View style={{ alignSelf: 'stretch', gap: 10, paddingTop: 10 }}>
        <ThemedButton
          fullWidth
          label={t('peopleList.add')}
          icon="plus"
          onPress={onAdd}
        />
        <ThemedButton
          fullWidth
          variant="secondary"
          label={t('peopleList.importFromPhone')}
          onPress={onImportPhone}
        />
      </View>
    </View>
  );
}

function LoadingState() {
  return (
    <View className="flex-1 items-center justify-center">
      <ActivityIndicator color={Colors.text2} />
    </View>
  );
}

function ContactsLoadError({ onRetry }: { readonly onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center gap-3 px-8 py-10">
      <SfIcon name="exclamationmark.triangle" size={36} color={Colors.warning} />
      <ThemedText variant="titleMedium" style={{ textAlign: 'center' }}>
        {t('peopleList.loadErrorTitle')}
      </ThemedText>
      <ThemedText variant="bodyMedium" tone="secondary" style={{ textAlign: 'center' }}>
        {t('peopleList.loadErrorBody')}
      </ThemedText>
      <View className="w-full pt-3">
        <ThemedButton fullWidth label={t('peopleList.tryAgain')} onPress={onRetry} />
      </View>
    </View>
  );
}

function EmptySearchState({
  query,
  onAdd,
  onImportPhone,
}: {
  readonly query: string;
  readonly onAdd: () => void;
  readonly onImportPhone: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ThemedSurface
      variant="outlined"
      style={{ borderStyle: 'dashed', paddingHorizontal: 16, paddingVertical: 22, gap: 8 }}
    >
      <ThemedText variant="titleMedium">
        {t('peopleList.noResults', { query })}
      </ThemedText>
      <ThemedText variant="bodySmall" tone="secondary">
        {t('peopleList.noResultsBody')}
      </ThemedText>
      <View className="w-full gap-2 pt-2">
        <ThemedButton
          fullWidth
          variant="secondary"
          label={t('peopleList.add')}
          icon="plus"
          onPress={onAdd}
        />
        <ThemedButton
          fullWidth
          variant="secondary"
          label={t('peopleList.importFromPhone')}
          onPress={onImportPhone}
        />
      </View>
    </ThemedSurface>
  );
}
