/**
 * PresentCard — the one card (10 §4). The QR is the Page itself, in one of
 * two forms:
 *
 *   online   the claimed name (QR `creds.id/@name` until 15 §6 P3; printed
 *            and shared as `creds.id/name`), else a verified handle or the
 *            nostr short URL — always the latest Page. Needs this phone to
 *            be online too, so the form is off while it has no network.
 *   offline  the signed fragment URL — works with no network on either side,
 *            but only carries the name, the links and the did.
 *
 * Before the Page is published there is no online form, so the card opens on
 * offline and says why instead of drawing a QR for an address that does not
 * resolve yet.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useNetworkState } from 'expo-network';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import type { ProfileRecord } from '@solidarity/shared';

import { generateQrPng } from '@/cards/qrCodeManager';
import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import {
  displayProfileShareUrl,
  profileShareQrUrl,
  publicNameUrl,
  type PublicPageShareSource,
  type ProfileShareUrlCandidate,
} from '@/components/me/meProfileModel';
import { useProfileShareSelection } from '@/components/me/useProfileShareSelection';
import { CARD_FINISHES, finishSwatch, useCardFinish, type CardFinish } from '@/components/present/cardFinish';
import { PhysicalCardSheet } from '@/components/present/PhysicalCardSheet';
import { PresentCardVisual } from '@/components/present/PresentCardVisual';
import { ON_DARK, ThemedButton, ThemedSurface, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { useContentWidth } from '@/constants/layout';
import { Radius } from '@/constants/radius';
import { useThemeColors } from '@/constants/useThemeColors';
import { zoomFadeIn, DURATION } from '@/feedback/motion';
import { useTranslation } from '@/i18n';
import { validatePublicPageUsername } from '@/onboarding/publicPageUsername';
import { linkDisplay } from '@/profile/linkPresentation';
import { usePreferences } from '@/settings/preferences';

export type PresentQrMode = 'online' | 'offline';

type QrState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly uri: string }
  | { readonly kind: 'error' };

/** The plate never grows past this — a bigger code scans no better. */
const MAX_QR_SIZE = 280;
const QR_PLATE_PADDING = 14;

function onlineCandidate(
  candidates: readonly ProfileShareUrlCandidate[],
): ProfileShareUrlCandidate | null {
  return (
    candidates.find((c) => c.kind === 'username') ??
    candidates.find((c) => c.kind === 'handle' && c.isVerified) ??
    candidates.find((c) => c.kind === 'short') ??
    null
  );
}

function qrValue(candidate: ProfileShareUrlCandidate | null): string | null {
  return candidate === null ? null : profileShareQrUrl(candidate);
}

/**
 * No network on this phone: `false` only when the OS says so. Unknown (the
 * first frames, before the native state arrives) is not "offline".
 */
function useDeviceOffline(): boolean {
  const network = useNetworkState();
  return network.isConnected === false || network.isInternetReachable === false;
}

function useRegisteredName(): string | null {
  const name = usePreferences((state) => state.publicPageRegisteredUsername);
  return validatePublicPageUsername(name).kind === 'valid' ? name : null;
}

function useQrPng(value: string | null, size: number): QrState {
  const [state, setState] = useState<QrState>({ kind: 'loading' });
  useEffect(() => {
    if (value === null) {
      setState({ kind: 'error' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    // The offline URL is long; let the encoder pick the level that fits.
    void generateQrPng(value, { size, startingLevel: 'M' })
      .then((uri) => {
        if (!cancelled) setState({ kind: 'ready', uri });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);
  return state;
}

export function PresentCard({
  ownerName,
  shareRecord,
  shareJws,
  publicPage,
  nostrShortUrlReady,
}: {
  readonly ownerName: string | null;
  readonly shareRecord: ProfileRecord;
  readonly shareJws: string;
  readonly publicPage: PublicPageShareSource | null;
  readonly nostrShortUrlReady: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const [physicalCardOpen, setPhysicalCardOpen] = useState(false);
  const selection = useProfileShareSelection(shareRecord, shareJws, nostrShortUrlReady, 0, publicPage);

  const finish = useCardFinish();
  const setPreference = usePreferences((state) => state.set);
  const deviceOffline = useDeviceOffline();
  const registeredName = useRegisteredName();

  const candidates = selection.kind === 'error' ? [] : selection.candidates;
  const online = onlineCandidate(candidates);
  const offline = candidates.find((c) => c.kind === 'offline') ?? null;
  const onlineAvailable = online !== null && !deviceOffline;
  const [chosen, setChosen] = useState<PresentQrMode>('online');
  const mode: PresentQrMode = onlineAvailable ? chosen : 'offline';
  const active = mode === 'online' ? online : offline;
  // A name this phone registered is the card's address even while its
  // binding waits to publish: the card never prints an npub over it.
  const displayUrl =
    online?.kind === 'username'
      ? displayProfileShareUrl(online)
      : registeredName !== null
        ? linkDisplay('', publicNameUrl(registeredName)).text
        : online
          ? displayProfileShareUrl(online)
          : t('present.unpublished');
  const offlineReason: QrOfflineReason =
    online === null ? 'unpublished' : deviceOffline ? 'noNetwork' : 'chosen';

  return (
    <View style={{ gap: 16 }}>
      <PresentCardVisual
        finish={finish}
        name={ownerName}
        summary={t(mode === 'online' ? 'present.mode.onlineSummary' : 'present.mode.offlineSummary')}
        scanHint={t('present.scanToExchange')}
        displayUrl={displayUrl}
        flipLabel={t('present.flipCard')}
      />
      <CardFinishPicker
        value={finish}
        onChange={(next) => {
          setPreference('presentPhysicalCardMaterial', next);
        }}
      />
      {/* One plate: which form the code takes sits on it, not beside it. */}
      <ThemedSurface variant="card" className="items-center" style={{ paddingTop: 12, paddingBottom: 20, gap: 14 }}>
        <QrModeControl mode={mode} onlineAvailable={onlineAvailable} onChange={setChosen} />
        <QrPlate key={mode} value={qrValue(active)} mode={mode} offlineReason={offlineReason} />
      </ThemedSurface>
      {registeredName !== null && online?.kind !== 'username' ? (
        <ThemedSurface variant="inset" padded className="flex-row items-center gap-3">
          <ThemedText variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
            {t('present.finishNameHint', { name: registeredName })}
          </ThemedText>
          <ThemedButton
            variant="secondary"
            size="sm"
            label={t('present.finishName')}
            onPress={() => { router.push('/settings/username'); }}
          />
        </ThemedSurface>
      ) : online !== null && online.kind !== 'username' ? (
        <ThemedSurface variant="inset" padded className="flex-row items-center gap-3">
          <ThemedText variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
            {t('present.claimNameHint')}
          </ThemedText>
          <ThemedButton
            variant="secondary"
            size="sm"
            label={t('socialProof.claimName')}
            onPress={() => { router.push('/settings/username'); }}
          />
        </ThemedSurface>
      ) : null}
      <View style={{ alignSelf: 'center' }}>
        <ThemedButton
          variant="secondary"
          size="sm"
          icon="creditcard"
          label={t('present.orderPhysicalCard')}
          onPress={() => {
            setPhysicalCardOpen(true);
          }}
        />
      </View>
      <PhysicalCardSheet
        visible={physicalCardOpen}
        name={ownerName}
        address={displayUrl}
        onClose={() => {
          setPhysicalCardOpen(false);
        }}
      />
    </View>
  );
}

function QrModeControl({
  mode,
  onlineAvailable,
  onChange,
}: {
  readonly mode: PresentQrMode;
  readonly onlineAvailable: boolean;
  readonly onChange: (mode: PresentQrMode) => void;
}): ReactNode {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const options: readonly PresentQrMode[] = ['online', 'offline'];
  return (
    <ThemedSurface
      accessibilityRole="tablist"
      variant="inset"
      className="flex-row"
      style={{ borderRadius: Radius.card, padding: 3, borderWidth: 0 }}>
      {options.map((option) => {
        const selected = option === mode;
        const disabled = option === 'online' && !onlineAvailable;
        return (
          <PressableScale
            key={option}
            haptic="tap"
            disabled={disabled}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={t(`present.mode.${option}`)}
            onPress={() => {
              onChange(option);
            }}
            style={{
              minHeight: 32,
              minWidth: 76,
              paddingHorizontal: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? colors.cardBg : 'transparent',
              borderRadius: Radius.group - 3,
              opacity: disabled ? 0.45 : 1,
            }}>
            <ThemedText variant="label" style={{ color: selected ? colors.text1 : colors.text3 }}>
              {t(`present.mode.${option}`)}
            </ThemedText>
          </PressableScale>
        );
      })}
    </ThemedSurface>
  );
}

type QrOfflineReason = 'chosen' | 'unpublished' | 'noNetwork';

function QrPlate({
  value,
  mode,
  offlineReason,
}: {
  readonly value: string | null;
  readonly mode: PresentQrMode;
  readonly offlineReason: QrOfflineReason;
}): ReactNode {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const width = useContentWidth();
  const size = Math.min(MAX_QR_SIZE, width - 32 - QR_PLATE_PADDING * 2 - 32);
  const qr = useQrPng(value, size);

  return (
    <Animated.View entering={reduceMotion ? undefined : zoomFadeIn(DURATION.enter)} style={{ alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: size + QR_PLATE_PADDING * 2,
            height: size + QR_PLATE_PADDING * 2,
            padding: QR_PLATE_PADDING,
            borderRadius: Radius.group,
            // The code needs a light quiet zone in dark mode too.
            backgroundColor: ON_DARK,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {qr.kind === 'ready' ? (
            <Image
              source={{ uri: qr.uri }}
              contentFit="contain"
              accessibilityLabel={t('present.qrLabel')}
              style={{ width: size, height: size }}
            />
          ) : qr.kind === 'loading' ? (
            <ActivityIndicator color={Colors.text2} />
          ) : (
            <View className="items-center" style={{ gap: 8 }}>
              <SfIcon name="exclamationmark.triangle" size={22} color={Colors.destructive} />
              <ThemedText variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
                {t('present.qrError')}
              </ThemedText>
            </View>
          )}
        </View>
        <ThemedText variant="caption" tone="secondary" style={{ textAlign: 'center', paddingHorizontal: 20 }}>
          {mode === 'online'
            ? t('present.mode.onlineHint')
            : offlineReason === 'unpublished'
              ? t('present.mode.offlineOnlyHint')
              : offlineReason === 'noNetwork'
                ? t('present.mode.noNetworkHint')
                : t('present.mode.offlineHint')}
        </ThemedText>
    </Animated.View>
  );
}

/** The card's finish, picked right under the card it restyles. */
function CardFinishPicker({
  value,
  onChange,
}: {
  readonly value: CardFinish;
  readonly onChange: (finish: CardFinish) => void;
}): ReactNode {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <View accessibilityRole="radiogroup" className="flex-row justify-center" style={{ marginTop: -4 }}>
      {CARD_FINISHES.map((finish) => {
        const selected = finish === value;
        return (
          <PressableScale
            key={finish}
            haptic="tap"
            accessibilityRole="radio"
            accessibilityLabel={t(`present.physicalCard.material.${finish}`)}
            accessibilityState={{ checked: selected }}
            onPress={() => {
              onChange(finish);
            }}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: Radius.pill,
                padding: 2,
                borderWidth: 2,
                borderColor: selected ? colors.primaryBlue : 'transparent',
              }}>
              <LinearGradient
                colors={finishSwatch(finish)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ flex: 1, borderRadius: Radius.pill }}
              />
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}
