import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CopyableAddress } from '@/components/common/CopyableAddress';
import { InfoButton } from '@/components/common/InfoSheet';
import { ModalSheet, sheetTopInset } from '@/components/common/ModalSheet';
import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { SettingsScreenTitle } from '@/components/settings/SettingsBlocks';
import { ThemedButton, ThemedSurface, ThemedText, ThemedTextInput } from '@/components/themed';
import { useWebEditing, WEB_EDITOR_URL } from '@/components/webEditing/useWebEditing';
import { webEditingViewModel } from '@/components/webEditing/webEditingViewModel';
import { useThemeColors } from '@/constants/useThemeColors';
import { showError } from '@/feedback/appAlert';
import { confirmDialog } from '@/feedback/confirmDialog';
import { haptic } from '@/feedback/haptics';
import { fadeUpIn } from '@/feedback/motion';
import { pushToast } from '@/feedback/toast';
import {
  createPasskeyIndexClient,
  listIndexedPasskeys,
  readStoredVaultAccess,
  removeIndexedPasskey,
  renameIndexedPasskey,
  type IndexedPasskey,
} from '@/identity/passkeyIndex';
import { getPasskeyRegistry, type PasskeyRow } from '@/identity/passkeyRegistry';
import { useTranslation } from '@/i18n';
import { safeBack } from '@/navigation/safeBack';

type ListState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly rows: readonly IndexedPasskey[]; readonly pending: readonly PasskeyRow[] };

const client = createPasskeyIndexClient();

function localRows(binding: string): PasskeyRow[] | null {
  const listed = getPasskeyRegistry().list(binding, false);
  if (!listed.ok) return null;
  return listed.value.filter((row): row is PasskeyRow => !('legacy' in row));
}

/** One owner-index round trip with keys derived for it and zeroed after. */
async function withAccess<T>(run: (access: Awaited<ReturnType<typeof readStoredVaultAccess>> & { ok: true }) => Promise<T>): Promise<T | null> {
  const access = await readStoredVaultAccess();
  if (!access.ok) return null;
  try {
    return await run(access);
  } finally {
    access.value.ownerSecret.fill(0);
    access.value.metaKey.fill(0);
  }
}

export function PasskeysScreen() {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const web = useWebEditing();
  const [list, setList] = useState<ListState>({ kind: 'loading' });
  const [selected, setSelected] = useState<IndexedPasskey | null>(null);
  const [revision, setRevision] = useState(0);
  const busy = web.state.kind === 'ready' && web.state.busy !== null;
  const loadFailed = list.kind === 'error' || (web.state.kind === 'error' && web.state.operation === 'load');

  useEffect(() => {
    if (web.state.kind === 'loading' || web.state.kind === 'ready' && web.state.busy !== null) return;
    const binding = web.binding;
    if (!binding) {
      setList({ kind: 'error' });
      return;
    }
    let live = true;
    setList({ kind: 'loading' });
    void (async () => {
      const local = localRows(binding);
      const listed = local === null ? null : await withAccess(({ value }) =>
        listIndexedPasskeys({ access: value, client, localRows: local }));
      if (!live) return;
      if (local === null || !listed?.ok) {
        setList({ kind: 'error' });
        return;
      }
      const onServer = new Set(listed.value.map(row => row.locator));
      setList({
        kind: 'ready',
        rows: listed.value,
        pending: local.filter(row => row.status === 'pending' && !onServer.has(row.locator)),
      });
    })();
    return () => { live = false; };
  }, [web.state, web.binding, revision]);

  const reload = useCallback(() => { setRevision(value => value + 1); }, []);
  const dateOf = (seconds: number) => new Date(seconds * 1_000).toLocaleDateString(i18n.language);
  const titleOf = (row: IndexedPasskey) => row.meta?.label ?? t('passkeys.unnamed');
  const subtitleOf = (row: IndexedPasskey) => [
    row.meta && (row.provider ?? row.meta.device) !== row.meta.label ? row.provider ?? row.meta.device : null,
    row.meta ? t(`passkeys.platform.${row.meta.platform}`) : null,
    t('passkeys.addedOn', { date: dateOf(row.createdAt) }),
  ].filter(Boolean).join(' · ');

  const rows = list.kind === 'ready' ? list.rows : [];
  const pending = list.kind === 'ready' ? list.pending : [];

  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <View style={{ minHeight: 44, justifyContent: 'center' }}>
        <SettingsScreenTitle
          title={t('passkeys.title')}
          leadingAction={{ accessibilityLabel: t('common.back'), onPress: () => { safeBack('/settings'); } }}
        />
        <View style={{ position: 'absolute', right: 24, top: 0, bottom: 8, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}>
          <InfoButton title={t('passkeys.aboutTitle')} body={t('passkeys.aboutBody')} />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 24 }}>
        <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
          {list.kind === 'loading' ? <ActivityIndicator color={colors.text3} /> : null}
          {loadFailed ? <ThemedText variant="bodyMedium" tone="secondary">{t('passkeys.loadFailed')}</ThemedText> : null}
          {loadFailed ? (
            <ThemedButton label={t('webEditing.retry')} variant="secondary" fullWidth onPress={() => { void web.refresh(); reload(); }} />
          ) : null}
          {list.kind === 'ready' && rows.length === 0 && pending.length === 0 ? (
            <ThemedText variant="bodyMedium" tone="secondary">{t('passkeys.empty')}</ThemedText>
          ) : null}
          {rows.length > 0 || pending.length > 0 ? (
            <ThemedSurface variant="outlined">
              {rows.map((row, index) => (
                <Animated.View key={row.locator} entering={fadeUpIn(index, reduceMotion)}>
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel={`${titleOf(row)}, ${subtitleOf(row)}`}
                    onPress={() => { setSelected(row); }}
                    style={{ minHeight: 72, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <SfIcon name={row.meta?.platform === 'web' ? 'desktopcomputer' : 'key.fill'} size={22} color={colors.text2} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <ThemedText variant="bodyLarge">{titleOf(row)}</ThemedText>
                        {row.thisDevice ? <ThemedText variant="caption" tone="accent">{t('passkeys.thisDevice')}</ThemedText> : null}
                      </View>
                      <ThemedText variant="caption" tone="secondary">{subtitleOf(row)}</ThemedText>
                    </View>
                    <SfIcon name="chevron.right" size={12} color={colors.text3} />
                  </PressableScale>
                </Animated.View>
              ))}
              {pending.map(row => (
                <View key={row.credentialId} style={{ padding: 16, gap: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                    <SfIcon name="key.fill" size={22} color={colors.text3} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <ThemedText variant="bodyLarge">{row.device}</ThemedText>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <SfIcon name="exclamationmark.triangle" size={14} color={colors.destructive} />
                        <ThemedText variant="caption" tone="secondary">{t('passkeys.pending')}</ThemedText>
                      </View>
                    </View>
                  </View>
                  <ThemedButton label={t('webEditing.retry')} variant="secondary" disabled={busy} onPress={() => { void web.addPasskey(true).then(reload); }} />
                </View>
              ))}
            </ThemedSurface>
          ) : null}
          {loadFailed ? null : <ThemedButton
            label={t('passkeys.add')}
            variant="secondary"
            fullWidth
            disabled={list.kind !== 'ready' || pending.length > 0 || web.state.kind !== 'ready'}
            loading={web.state.kind === 'ready' && web.state.busy === 'add'}
            onPress={() => { void web.addPasskey().then(reload); }}
          />}
        </View>
        {loadFailed ? null : <EditOnComputerBlock web={web} busy={busy} hasPasskeys={rows.length > 0} />}
      </ScrollView>
      <ModalSheet visible={selected !== null} presentationStyle="formSheet" onRequestClose={() => { setSelected(null); }}>
        {selected ? (
          <PasskeyDetails
            entry={selected}
            title={titleOf(selected)}
            subtitle={subtitleOf(selected)}
            isLast={rows.length === 1}
            onClose={() => { setSelected(null); }}
            onChanged={() => { setSelected(null); reload(); }}
          />
        ) : null}
      </ModalSheet>
    </View>
  );
}

function PasskeyDetails({ entry, title, subtitle, isLast, onClose, onChanged }: {
  entry: IndexedPasskey; title: string; subtitle: string; isLast: boolean; onClose: () => void; onChanged: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [label, setLabel] = useState(entry.meta?.label ?? '');
  const [busy, setBusy] = useState<'rename' | 'remove' | null>(null);

  const rename = async () => {
    if (busy) return;
    setBusy('rename');
    const result = await withAccess(({ value }) => renameIndexedPasskey({ access: value, client, entry, label }));
    setBusy(null);
    if (result?.ok) {
      haptic('success');
      onChanged();
    } else {
      showError({ context: 'Settings › Passkeys › Rename', summary: t('passkeys.renameFailed'), code: result?.ok === false ? result.error.kind : 'notProvisioned' });
    }
  };

  const remove = async () => {
    if (busy) return;
    const confirmed = await confirmDialog({
      title: t('passkeys.removeTitle'),
      message: isLast ? t('passkeys.removeLastBody') : t('passkeys.removeBody'),
      confirmLabel: t('passkeys.remove'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!confirmed) return;
    setBusy('remove');
    const result = await withAccess(({ value }) => removeIndexedPasskey({ access: value, client, entry }));
    setBusy(null);
    if (result?.ok) {
      pushToast(t('passkeys.removed'), 'info');
      onChanged();
    } else {
      haptic('error');
      showError({ context: 'Settings › Passkeys › Remove', summary: t('passkeys.removeFailed'), code: result?.ok === false ? result.error.kind : 'notProvisioned' });
    }
  };

  return (
    <View className="flex-1 bg-pageBg">
      <KeyboardAwareScrollView bottomOffset={16} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingTop: sheetTopInset(insets.top) + 24, paddingBottom: insets.bottom + 24, gap: 16 }}>
        <ThemedText variant="titleLarge">{title}</ThemedText>
        <ThemedText variant="bodyMedium" tone="secondary">{subtitle}</ThemedText>
        {entry.meta ? (
          <View style={{ gap: 8 }}>
            <ThemedText variant="label">{t('passkeys.nameLabel')}</ThemedText>
            <ThemedTextInput value={label} onChangeText={setLabel} maxLength={64} autoCorrect={false} returnKeyType="done"
              onSubmitEditing={() => { void rename(); }} accessibilityLabel={t('passkeys.nameLabel')} />
            <ThemedButton label={t('passkeys.saveName')} fullWidth loading={busy === 'rename'}
              disabled={busy !== null || label.trim() === '' || label.trim() === entry.meta.label} onPress={() => { void rename(); }} />
          </View>
        ) : null}
        <ThemedText variant="bodyMedium" tone="secondary">{t('passkeys.removeHint')}</ThemedText>
        <ThemedButton label={t('passkeys.remove')} variant="destructive" fullWidth loading={busy === 'remove'} disabled={busy !== null} onPress={() => { void remove(); }} />
        <ThemedButton label={t('common.close')} variant="secondary" fullWidth onPress={onClose} />
      </KeyboardAwareScrollView>
    </View>
  );
}

/** "Edit on your computer": the address to carry over, and one action. */
function EditOnComputerBlock({ web, busy, hasPasskeys }: { web: ReturnType<typeof useWebEditing>; busy: boolean; hasPasskeys: boolean }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const view = webEditingViewModel(web.state);
  // A passkey added on the web or another phone signs in just the same; only
  // this phone's local flag would say "not connected".
  const listedOnly = hasPasskeys && !(web.state.kind === 'ready' && web.state.connection === 'connected');
  const connected = listedOnly || (web.state.kind === 'ready' && web.state.connection === 'connected');
  const primary = listedOnly ? null : view.primary && view.primary.action !== 'add' ? view.primary : null;
  return (
    <ThemedSurface variant="inset" padded>
      <View style={{ gap: 16 }} accessibilityLiveRegion="polite">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <SfIcon name="desktopcomputer" size={24} color={colors.text2} />
          <ThemedText variant="titleMedium" style={{ flex: 1 }}>{t('webEditing.title')}</ThemedText>
        </View>
        {web.state.kind === 'loading' ? <ActivityIndicator color={colors.text3} /> : null}
        {connected ? (
          <CopyableAddress address={WEB_EDITOR_URL} displayAddress="creds.id/edit"
            accessibilityLabel={t('webEditing.copyAddress', { url: 'creds.id/edit' })}
            copiedMessage={t('webEditing.addressCopied')} failedMessage={t('webEditing.addressCopyFailed')} />
        ) : <ThemedText variant="bodyMedium" tone="secondary">{t(view.copyKey)}</ThemedText>}
        {listedOnly ? (
          <ThemedButton label={t('webEditing.open')} fullWidth disabled={busy}
            onPress={() => { void Linking.openURL(WEB_EDITOR_URL).catch(() => { pushToast(t('webEditing.openFailed'), 'error'); }); }} />
        ) : null}
        {primary ? (
          <ThemedButton label={t(primary.labelKey)} fullWidth disabled={primary.disabled || busy}
            loading={web.state.kind === 'ready' && web.state.busy === 'open'}
            onPress={() => { void (primary.action === 'refresh' ? web.refresh() : web.openEditor()); }} />
        ) : null}
      </View>
    </ThemedSurface>
  );
}
