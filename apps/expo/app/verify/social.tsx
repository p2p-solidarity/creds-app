/**
 * Verify a social link with zkTLS (docs/ref/10 §2): click and confirm.
 *
 *   intro    → 「複製並打開 X」copies creds.id/@name and opens the bio editor
 *   waiting  → returning to the app (foreground) starts the proof by itself
 *   proving  → on-device TLSNotary through the creds.id notary (a few seconds)
 *   found    → confirm card; 「加上綠勾」re-signs the Page (the one Face ID)
 *   done / error — every failure names one next action (Rule 8: no fake check)
 *
 * A missing marker is retried automatically a few times — platforms take a
 * moment to serve the saved bio — before asking the owner to retry.
 */
import * as Clipboard from 'expo-clipboard';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Linking, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SealPill } from '@/components/badges/SealPill';
import { BrandIcon } from '@/components/icons/BrandIcon';
import { SfIcon } from '@/components/icons/SfIcon';
import { SettingsBackToolbar, SettingsScreenTitle } from '@/components/settings/SettingsBlocks';
import { ThemedButton, ThemedSurface, ThemedText } from '@/components/themed';
import { MONO } from '@/constants/fonts';
import { useThemeColors } from '@/constants/useThemeColors';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import { safeBack } from '@/navigation/safeBack';
import { linkDisplay } from '@/profile/linkPresentation';
import { usePreferences } from '@/settings/preferences';
import { proveSocialTarget, type ProofFailure } from '@/zktls/engine';
import { confirmSocialClaim } from '@/zktls/flow';
import { bioEditUrl, publicProfileUrl, type SocialTarget } from '@/zktls/links';
import { ZKTLS_PLATFORMS, type SocialProof, type ZktlsSocialPlatform } from '@solidarity/shared';

type Screen =
  | { readonly kind: 'intro' }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'proving'; readonly attempt: number }
  | { readonly kind: 'found'; readonly proof: SocialProof }
  | { readonly kind: 'saving'; readonly proof: SocialProof }
  | { readonly kind: 'done'; readonly published: boolean }
  | { readonly kind: 'error'; readonly failure: ProofFailure | 'signDenied' | 'noName' };

/** Platforms serve a just-saved bio after a short delay; retry the marker this often. */
const MARKER_RETRIES = 3;
const MARKER_RETRY_DELAY_MS = 4000;

function parseTarget(platform: unknown, handle: unknown): SocialTarget | null {
  if (typeof platform !== 'string' || typeof handle !== 'string') return null;
  if (!['x', 'telegram', 'github', 'website'].includes(platform)) return null;
  const p = platform as ZktlsSocialPlatform;
  return ZKTLS_PLATFORMS[p].handlePattern.test(handle) ? { platform: p, handle } : null;
}

export default function VerifySocialScreen(): ReactNode {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const params = useLocalSearchParams<{ platform?: string; handle?: string }>();
  const target = parseTarget(params.platform, params.handle);
  const name = usePreferences((s) => s.publicPageRegisteredUsername);
  const [screen, setScreen] = useState<Screen>(name === '' ? { kind: 'error', failure: 'noName' } : { kind: 'intro' });
  const running = useRef(false);

  const prove = useCallback(async () => {
    if (target === null || running.current) return;
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

  if (target === null) {
    return <Shell title={t('zktls.title')}><ErrorBody failure="failed" onRetry={null} /></Shell>;
  }
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

  const confirm = async (proof: SocialProof) => {
    setScreen({ kind: 'saving', proof });
    const result = await confirmSocialClaim(proof);
    setScreen(result.ok ? { kind: 'done', published: result.value.published } : { kind: 'error', failure: 'signDenied' });
  };

  return (
    <Shell title={t('zktls.title')}>
      <View style={{ paddingBottom: insets.bottom + 32, gap: 16 }}>
        <TargetRow target={target} />

        {screen.kind === 'intro' || screen.kind === 'waiting' ? (
          <>
            <MarkerCard marker={marker} platformName={platformName} website={target.platform === 'website'} />
            {screen.kind === 'waiting' ? (
              <ThemedText variant="bodySmall" tone="secondary">
                {t('zktls.waiting', { platform: platformName })}
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
            <ThemedButton label={t('zktls.finish')} variant="inverted" fullWidth onPress={() => { safeBack(); }} />
          </>
        ) : null}

        {screen.kind === 'error' ? (
          <ErrorBody
            failure={screen.failure}
            platformName={platformName}
            onRetry={screen.failure === 'noName' ? null : () => { void prove(); }}
          />
        ) : null}
      </View>
    </Shell>
  );
}

function displayHandle(target: SocialTarget): string {
  return target.platform === 'website' ? target.handle : `@${target.handle}`;
}

function Shell({ title, children }: { readonly title: string; readonly children: ReactNode }): ReactNode {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <Stack.Screen options={{ presentation: 'modal' }} />
      <SettingsBackToolbar title={t('zktls.cancel')} onPress={() => { safeBack(); }} />
      <SettingsScreenTitle title={title} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16 }}>{children}</ScrollView>
    </View>
  );
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
        borderRadius: 2,
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
  website,
}: {
  readonly marker: string;
  readonly platformName: string;
  readonly website: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  return (
    <View style={{ gap: 10 }}>
      <ThemedText variant="bodySmall" tone="secondary">
        {website ? t('zktls.instructionsWebsite') : t('zktls.instructions', { platform: platformName })}
      </ThemedText>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 14,
          paddingHorizontal: 14,
          backgroundColor: c.chipSurface,
          borderRadius: 2,
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

const FAILURE_KEY: Record<ProofFailure | 'signDenied' | 'noName', string> = {
  unavailable: 'zktls.error.unavailable',
  noNostrKey: 'zktls.error.noNostrKey',
  notary: 'zktls.error.notary',
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
      ) : onRetry !== null && failure !== 'unavailable' ? (
        <ThemedButton label={t('zktls.retry')} variant="primary" fullWidth onPress={onRetry} />
      ) : null}
    </View>
  );
}
