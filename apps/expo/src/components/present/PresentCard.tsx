/**
 * PresentCard — the one card (10 §4). The QR is the Page itself, in one of
 * two forms:
 *
 *   online   `creds.id/@name` (or the nostr short URL before a name exists) —
 *            short, scans from across a table, always the latest Page.
 *   offline  the signed fragment URL — works with no network on either side,
 *            but only carries the name, the links and the did.
 *
 * Before the Page is published there is no online form, so the card opens on
 * offline and says why instead of drawing a QR for an address that does not
 * resolve yet.
 */
import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, View, useWindowDimensions } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import type { ProfileRecord } from '@solidarity/shared';

import { generateQrPng } from '@/cards/qrCodeManager';
import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import {
  displayProfileShareUrl,
  type PublicPageShareSource,
  type ProfileShareUrlCandidate,
} from '@/components/me/meProfileModel';
import { useProfileShareSelection } from '@/components/me/useProfileShareSelection';
import { PhysicalCardSheet } from '@/components/present/PhysicalCardSheet';
import { PresentCardVisual } from '@/components/present/PresentCardVisual';
import { ON_DARK, ThemedButton, ThemedSurface, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { Radius } from '@/constants/radius';
import { useThemeColors } from '@/constants/useThemeColors';
import { zoomFadeIn, DURATION } from '@/feedback/motion';
import { useTranslation } from '@/i18n';

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

  const candidates = selection.kind === 'error' ? [] : selection.candidates;
  const online = onlineCandidate(candidates);
  const offline = candidates.find((c) => c.kind === 'offline') ?? null;
  const [chosen, setChosen] = useState<PresentQrMode>('online');
  const mode: PresentQrMode = online === null ? 'offline' : chosen;
  const active = mode === 'online' ? online : offline;
  const displayUrl = online ? displayProfileShareUrl(online) : t('present.unpublished');

  return (
    <View style={{ gap: 16 }}>
      <PresentCardVisual
        name={ownerName}
        summary={t(mode === 'online' ? 'present.mode.onlineSummary' : 'present.mode.offlineSummary')}
        scanHint={t('present.scanToExchange')}
        displayUrl={displayUrl}
        flipLabel={t('present.flipCard')}
      />
      {/* One plate: which form the code takes sits on it, not beside it. */}
      <ThemedSurface variant="card" className="items-center" style={{ paddingTop: 12, paddingBottom: 20, gap: 14 }}>
        <QrModeControl mode={mode} onlineAvailable={online !== null} onChange={setChosen} />
        <QrPlate key={mode} candidate={active} mode={mode} onlineMissing={online === null} />
      </ThemedSurface>
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

function QrPlate({
  candidate,
  mode,
  onlineMissing,
}: {
  readonly candidate: ProfileShareUrlCandidate | null;
  readonly mode: PresentQrMode;
  readonly onlineMissing: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const size = Math.min(MAX_QR_SIZE, width - 32 - QR_PLATE_PADDING * 2 - 32);
  const qr = useQrPng(candidate?.url ?? null, size);

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
            : onlineMissing
              ? t('present.mode.offlineOnlyHint')
              : t('present.mode.offlineHint')}
        </ThemedText>
    </Animated.View>
  );
}
