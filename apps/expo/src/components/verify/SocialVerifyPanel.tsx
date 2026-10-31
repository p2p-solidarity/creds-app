/**
 * SocialVerifyPanel — the link check of docs/ref/10 §2, click and confirm,
 * shown by the add-link sheet right after a link is added. (A Page link row
 * checks inline through `src/zktls/checkJobs.ts`; the old `/verify/social`
 * route is gone.)
 *
 *   intro    → 「複製並打開 X」copies creds.id/@name and opens the bio editor
 *   waiting  → returning to the app (foreground) starts the proof by itself
 *   proving  → this phone fetches the public page and signs with its attested key
 *   found    → confirm card; 「加上綠勾」re-signs the Page (the one Face ID)
 *   done / error — every failure names one next action (Rule 8: no fake check)
 *
 * A missing marker is retried automatically a few times — platforms take a
 * moment to serve the saved bio — before asking the owner to retry.
 */
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Linking, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { SealPill } from '@/components/badges/SealPill';
import { BrandIcon } from '@/components/icons/BrandIcon';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedButton, ThemedSurface, ThemedText } from '@/components/themed';
import { MONO } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { useThemeColors } from '@/constants/useThemeColors';
import { fadeUpIn } from '@/feedback/motion';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import { linkDisplay } from '@/profile/linkPresentation';
import { usePreferences } from '@/settings/preferences';
import { proveSocialTarget, type ProofFailure } from '@/zktls/engine';
import { confirmSocialClaim } from '@/zktls/flow';
import { bioEditUrl, publicProfileUrl } from '@/zktls/links';
import type { NostrEvent } from '@/nostr/nostrAdapter';
import { ZKTLS_PLATFORMS, type SocialTarget, type ZktlsSocialPlatform } from '@solidarity/shared';

type Screen =
  | { readonly kind: 'intro' }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'proving'; readonly attempt: number }
  | { readonly kind: 'found'; readonly proof: NostrEvent }
  | { readonly kind: 'saving'; readonly proof: NostrEvent }
  | { readonly kind: 'done'; readonly published: boolean }
  | { readonly kind: 'error'; readonly failure: ProofFailure | 'signDenied' | 'noName' };

/** Platforms serve a just-saved bio after a short delay; retry the marker this often. */
const MARKER_RETRIES = 3;
const MARKER_RETRY_DELAY_MS = 4000;

export function parseSocialTarget(platform: unknown, handle: unknown): SocialTarget | null {
  if (typeof platform !== 'string' || typeof handle !== 'string') return null;
  if (!['x', 'telegram', 'github', 'website'].includes(platform)) return null;
  const p = platform as ZktlsSocialPlatform;
  return ZKTLS_PLATFORMS[p].handlePattern.test(handle) ? { platform: p, handle } : null;
}

export function SocialVerifyPanel({
  target,
  showTarget = true,
  onFinish,
  finishLabel,
}: {
  readonly target: SocialTarget;
  /** The route shows which link is being checked; the add sheet already does. */
  readonly showTarget?: boolean;
  readonly onFinish: () => void;
  readonly finishLabel?: string;
}): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  const name = usePreferences((s) => s.publicPageRegisteredUsername);
  const [screen, setScreen] = useState<Screen>(name === '' ? { kind: 'error', failure: 'noName' } : { kind: 'intro' });
  const running = useRef(false);

  const reduceMotion = useReducedMotion();
  const prove = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (let attempt = 1; attempt <= MARKER_RETRIES; attempt++) {
        setScreen({ kind: 'proving', attempt });
        const result = await proveSocialTarget(target, name);
        if (result.ok) {
          setScreen({ kind: 'found', proof: result.value });
          return;
        }
        if (result.error !== 'markerMissing' || attempt === MARKER_RETRIES) {
          setScreen({ kind: 'error', failure: result.error });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, MARKER_RETRY_DELAY_MS));
      }
    } finally {
      running.current = false;
    }
  }, [name, target]);

  // Step ③: coming back from the platform starts the proof — no extra tap.
  useEffect(() => {
    if (screen.kind !== 'waiting') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void prove();
    });
    return () => {
      sub.remove();
    };
  }, [prove, screen.kind]);

  const platformName = t(`zktls.platform.${target.platform}`);
  const marker = `creds.id/@${name}`;

  const copyAndOpen = async () => {
    await Clipboard.setStringAsync(marker);
    const editUrl = bioEditUrl(target);
    if (editUrl === null) {
      pushToast(t('zktls.markerCopied'), 'success');
      setScreen({ kind: 'waiting' });
      return;
    }
    setScreen({ kind: 'waiting' });
    await Linking.openURL(editUrl).catch(() => {
      void Linking.openURL(publicProfileUrl(target));
    });
  };

  const confirm = async (proof: NostrEvent) => {
    setScreen({ kind: 'saving', proof });
    const result = await confirmSocialClaim(proof);
    setScreen(result.ok ? { kind: 'done', published: result.value.published } : { kind: 'error', failure: 'signDenied' });
  };

  return (
    <Animated.View key={screen.kind} entering={fadeUpIn(0, reduceMotion)} style={{ gap: 16 }}>
        {showTarget ? <TargetRow target={target} /> : null}

        {screen.kind === 'intro' || screen.kind === 'waiting' ? (
          <>
            <MarkerCard marker={marker} platformName={platformName} platform={target.platform} />
            {screen.kind === 'waiting' ? (
              <ThemedText variant="bodySmall" tone="secondary">
                {t(target.platform === 'x' ? 'zktls.waitingX' : 'zktls.waiting', { platform: platformName })}
              </ThemedText>
            ) : null}
            <ThemedButton
              label={target.platform === 'website' ? t('zktls.copyMarker') : t('zktls.copyAndOpen', { platform: platformName })}
              variant="primary"
              fullWidth
              onPress={() => {
                void copyAndOpen();
              }}
            />
            <ThemedButton
              label={t('zktls.alreadyAdded')}
              variant="secondary"
              fullWidth
              onPress={() => {
                void prove();
              }}
            />
          </>
        ) : null}

        {screen.kind === 'proving' ? (
          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
            <ActivityIndicator />
            <ThemedText variant="bodyMedium">{t('zktls.proving', { platform: platformName })}</ThemedText>
            <ThemedText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
              {screen.attempt > 1 ? t('zktls.provingRetry') : t('zktls.provingPrivacy')}
            </ThemedText>
          </View>
        ) : null}

        {screen.kind === 'found' || screen.kind === 'saving' ? (
          <>
            <ThemedSurface variant="card" style={{ padding: 16, gap: 10, borderWidth: 1, borderColor: c.divider }}>
              <SealPill state="verified" label={t('mePage.verified')} />
              <ThemedText variant="titleMedium">
                {t('zktls.found', { platform: platformName, handle: displayHandle(target) })}
              </ThemedText>
              <ThemedText variant="bodySmall" tone="secondary">
                {t('zktls.foundDetail')}
              </ThemedText>
            </ThemedSurface>
            <ThemedButton
              label={t('zktls.addCheck')}
              variant="primary"
              fullWidth
              loading={screen.kind === 'saving'}
              onPress={() => {
                void confirm(screen.proof);
              }}
            />
          </>
        ) : null}

        {screen.kind === 'done' ? (
          <>
            <ThemedSurface variant="card" style={{ padding: 16, gap: 10 }}>
              <SealPill state="verified" label={t('mePage.verified')} />
              <ThemedText variant="bodyMedium">{t('zktls.done')}</ThemedText>
              {screen.published ? null : (
                <ThemedText variant="caption" tone="error">
                  {t('zktls.publishPending')}
                </ThemedText>
              )}
            </ThemedSurface>
            <ThemedButton label={finishLabel ?? t('zktls.finish')} variant="inverted" fullWidth onPress={onFinish} />
          </>
        ) : null}

        {screen.kind === 'error' ? (
          <ErrorBody
            failure={screen.failure}
            platformName={platformName}
            onRetry={screen.failure === 'noName' ? null : () => { void prove(); }}
          />
        ) : null}
    </Animated.View>
  );
}

function displayHandle(target: SocialTarget): string {
  return target.platform === 'website' ? target.handle : `@${target.handle}`;
}

function TargetRow({ target }: { readonly target: SocialTarget }): ReactNode {
  const c = useThemeColors();
  const url = publicProfileUrl(target);
  const display = linkDisplay('', url);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: Radius.card,
        borderWidth: 1,
        borderColor: c.divider,
        backgroundColor: c.cardBg,
      }}>
      <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: c.mutedSurface }}>
        <BrandIcon name={display.brand} size={20} color={c.primaryBlue} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText variant="bodyMedium">{displayHandle(target)}</ThemedText>
        <ThemedText variant="caption" tone="tertiary" numberOfLines={1} style={{ fontFamily: MONO }}>
          {url.replace(/^https:\/\//u, '')}
        </ThemedText>
      </View>
    </View>
  );
}

function MarkerCard({
  marker,
  platformName,
  platform,
}: {
  readonly marker: string;
  readonly platformName: string;
  readonly platform: ZktlsSocialPlatform;
}): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  return (
    <View style={{ gap: 10 }}>
      <ThemedText variant="bodySmall" tone="secondary">
        {platform === 'website'
          ? t('zktls.instructionsWebsite')
          : t(platform === 'x' ? 'zktls.instructionsX' : 'zktls.instructions', { platform: platformName })}
      </ThemedText>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 14,
          paddingHorizontal: 14,
          backgroundColor: c.chipSurface,
          borderRadius: Radius.field,
        }}>
        <SfIcon name="link" size={14} color={c.primaryBlue} />
        <ThemedText variant="bodyMedium" style={{ flex: 1, fontFamily: MONO }}>
          {marker}
        </ThemedText>
      </View>
      <ThemedText variant="caption" tone="tertiary">
        {t('zktls.keepMarker')}
      </ThemedText>
    </View>
  );
}

export const FAILURE_KEY: Record<ProofFailure | 'signDenied' | 'noName', string> = {
  unsupported: 'zktls.error.unsupported',
  serverUnavailable: 'zktls.error.serverUnavailable',
  deviceRejected: 'zktls.error.deviceRejected',
  network: 'zktls.error.network',
  noNostrKey: 'zktls.error.noNostrKey',
  notFound: 'zktls.error.notFound',
  blocked: 'zktls.error.blocked',
  markerMissing: 'zktls.error.markerMissing',
  failed: 'zktls.error.failed',
  signDenied: 'zktls.error.signDenied',
  noName: 'zktls.error.noName',
};

function ErrorBody({
  failure,
  platformName = '',
  onRetry,
}: {
  readonly failure: ProofFailure | 'signDenied' | 'noName';
  readonly platformName?: string;
  readonly onRetry: (() => void) | null;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 16 }}>
      <ThemedSurface variant="inset" style={{ padding: 16 }}>
        <ThemedText variant="bodyMedium">{t(FAILURE_KEY[failure], { platform: platformName })}</ThemedText>
      </ThemedSurface>
      {failure === 'noName' ? (
        <ThemedButton label={t('zktls.claimName')} variant="primary" fullWidth onPress={() => { router.push('/settings/username'); }} />
      ) : failure === 'noNostrKey' ? (
        <ThemedButton label={t('zktls.setupNostr')} variant="primary" fullWidth onPress={() => { router.push('/verify/nostr'); }} />
      ) : onRetry !== null && failure !== 'unsupported' && failure !== 'deviceRejected' ? (
        <ThemedButton label={t('zktls.retry')} variant="primary" fullWidth onPress={onRetry} />
      ) : null}
    </View>
  );
}
