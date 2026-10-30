import { useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import type { ProfileLink } from '@solidarity/shared';

import { SignSeal, type SignSealState } from '@/components/brand/SignSeal';
import { PressableScale } from '@/components/common/PressableScale';
import { LinkIcon } from '@/components/icons/LinkIcon';
import { AddLinkSheet } from '@/components/me/AddLinkSheet';
import { LinkPageImportSheet } from '@/components/profile/LinkPageImportSheet';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedButton, ThemedSurface, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { useThemeColors } from '@/constants/useThemeColors';
import { showError } from '@/feedback/appAlert';
import { haptic } from '@/feedback/haptics';
import { LIST_LAYOUT, fadeOutSettle, fadeUpIn } from '@/feedback/motion';
import { useTranslation } from '@/i18n';
import { linkDisplay } from '@/profile/linkPresentation';
import { useProfileStore } from '@/profile/store';
import { usePreferences } from '@/settings/preferences';
import { startPublicPagePublish } from '@/nip05/backgroundPublish';
import { getNostrPubkey, hasNostrKey, npubEncode, provisionFromRootMnemonic } from '@/nostr/userKey';

import { V2OnboardingScaffold } from './V2OnboardingScaffold';

/** How long the signing explanation shows before Face ID is asked for. */
const SIGN_LEAD_MS = 450;
/** How long the sealed mark holds before the Ready step. */
const SIGNED_HOLD_MS = 650;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeLinks(
  existing: readonly ProfileLink[],
  additions: readonly ProfileLink[],
): readonly ProfileLink[] {
  const seen = new Set(existing.map((link) => link.url));
  return [
    ...existing,
    ...additions.filter((link) => {
      if (seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    }),
  ];
}

export function LinksStep({
  onBack,
  onDone,
}: {
  readonly onBack: () => void;
  readonly onDone: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const username = usePreferences((state) => state.publicPageUsername);
  const record = useProfileStore((state) => state.record);
  const visibility = useProfileStore((state) => state.linkVisibility);
  const saveProfile = useProfileStore((state) => state.saveProfile);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // Links added here wait as a draft and are signed together — one Face ID.
  const [drafts, setDrafts] = useState<readonly ProfileLink[]>([]);
  const [saving, setSaving] = useState(false);
  const [seal, setSeal] = useState<SignSealState | null>(null);
  const reduceMotion = useReducedMotion();

  const saveLinks = async (additions: readonly ProfileLink[]): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setImportOpen(false);
    setSeal('waiting');
    try {
      // Let the explanation land before the OS sheet covers the middle of the screen.
      await wait(SIGN_LEAD_MS);
      const existing = record?.links ?? [];
      const links = mergeLinks(existing, additions);
      // A restored identity has no publishing key yet: derive it now, under this
      // same explanation, so the background publish never raises Face ID later.
      if (!(await hasNostrKey())) await provisionFromRootMnemonic();
      const saveOptions = await npubClaimSaveOptions(record?.alsoKnownAs ?? []);
      const saved = await saveProfile(
        {
          displayName: record?.displayName.trim() || username,
          bio: record?.bio ?? '',
          links,
          linkVisibility: [
            ...visibility,
            ...Array.from({ length: links.length - existing.length }, () => 'public' as const),
          ],
        },
        saveOptions,
      );
      if (!saved.ok) throw new Error(saved.error);

      setSeal('signed');
      haptic('success');
      void startPublicPagePublish(username);
      await wait(SIGNED_HOLD_MS);
      onDone();
    } catch (error) {
      setSeal(null);
      haptic('error');
      showError({
        context: 'Onboarding › Links',
        summary: t('ob.links.failed'),
        error,
      });
    } finally {
      setSaving(false);
    }
  };

  if (seal !== null) {
    return (
      <V2OnboardingScaffold
        stepIndex={3}
        title={t(seal === 'signed' ? 'ob.sign.done' : Platform.OS === 'ios' ? 'ob.sign.title.ios' : 'ob.sign.title')}
        subtitle={t('ob.sign.sub')}>
        {/* Lower half: the OS Face ID sheet sits mid-screen and would cover it. */}
        <View className="flex-1 items-center justify-end" style={{ paddingBottom: 72 }}>
          <SignSeal size={132} state={seal} />
        </View>
      </V2OnboardingScaffold>
    );
  }

  return (
    <>
      <V2OnboardingScaffold
        stepIndex={3}
        title={t('ob.links.title')}
        subtitle={t('ob.links.sub')}
        onBack={onBack}
        footer={
          drafts.length > 0 ? (
            <ThemedButton
              label={t('ob.links.signCount', { count: drafts.length })}
              variant="primary"
              fullWidth
              loading={saving}
              onPress={() => { void saveLinks(drafts); }}
            />
          ) : (
            <ThemedButton
              label={t('ob.links.empty')}
              variant="secondary"
              fullWidth
              loading={saving}
              onPress={() => { void saveLinks([]); }}
            />
          )
        }>
        <View style={{ gap: 12, paddingTop: 20 }}>
          <ChoiceCard
            icon="plus"
            title={t('ob.links.manual')}
            subtitle={t('ob.links.manual.sub')}
            onPress={() => { setAddOpen(true); }}
          />
          {drafts.map((link, index) => (
            <Animated.View
              key={link.url}
              entering={fadeUpIn(0, reduceMotion)}
              exiting={reduceMotion ? undefined : fadeOutSettle()}
              layout={reduceMotion ? undefined : LIST_LAYOUT}>
              <DraftRow
                link={link}
                onRemove={() => {
                  setDrafts((current) => current.filter((_, i) => i !== index));
                }}
              />
            </Animated.View>
          ))}
          <ChoiceCard
            icon="bolt.fill"
            title={t('ob.links.import')}
            subtitle={t('ob.links.import.sub')}
            onPress={() => { setImportOpen(true); }}
          />
        </View>
      </V2OnboardingScaffold>

      <AddLinkSheet
        visible={addOpen}
        initialLink={null}
        onSubmit={(link) => {
          setDrafts((current) => mergeLinks(current, [{ label: link.label, url: link.url }]));
          setAddOpen(false);
        }}
        onClose={() => { setAddOpen(false); }}
      />

      <LinkPageImportSheet
        visible={importOpen}
        title={t('ob.links.import')}
        confirmLabel={t('ob.links.import.confirm')}
        onClose={() => { setImportOpen(false); }}
        onImport={(result) => {
          void saveLinks(mergeLinks(drafts, result.links.map((link) => ({
            label: link.label,
            url: link.url,
          }))));
        }}
      />
    </>
  );
}

function DraftRow({ link, onRemove }: { readonly link: ProfileLink; readonly onRemove: () => void }): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  const display = linkDisplay(link.label, link.url);
  return (
    <ThemedSurface variant="card" className="flex-row items-center" style={{ gap: 12, paddingVertical: 10, paddingLeft: 12 }}>
      <LinkIcon label={link.label} url={link.url} size={36} glyph={18} surface={c.chipSurface} />
      <View className="flex-1" style={{ gap: 1 }}>
        <ThemedText variant="bodyMedium" numberOfLines={1} ellipsizeMode="middle">
          {display.text}
        </ThemedText>
        <ThemedText variant="caption" tone="tertiary" numberOfLines={1}>
          {link.label}
        </ThemedText>
      </View>
      <PressableScale
        haptic="tap"
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={t('ob.links.remove', { label: display.text })}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <SfIcon name="xmark" size={14} color={c.text3} />
      </PressableScale>
    </ThemedSurface>
  );
}

function ChoiceCard({
  icon,
  title,
  subtitle,
  onPress,
}: {
  readonly icon: 'bolt.fill' | 'plus';
  readonly title: string;
  readonly subtitle: string;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <PressableScale
      haptic="tap"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      containerStyle={{ alignSelf: 'stretch' }}>
      <ThemedSurface
        variant="card"
        className="flex-row items-center gap-4 px-4 py-4"
        style={{ minHeight: 76 }}>
        <View
          className="h-11 w-11 items-center justify-center rounded-pill"
          style={{ backgroundColor: Colors.searchBg }}>
          <SfIcon name={icon} size={20} color={Colors.primaryMauve} />
        </View>
        <View className="flex-1 gap-1">
          <ThemedText variant="label">{title}</ThemedText>
          <ThemedText variant="caption" tone="secondary">
            {subtitle}
          </ThemedText>
        </View>
        <SfIcon name="chevron.right" size={15} color={Colors.text3} />
      </ThemedSurface>
    </PressableScale>
  );
}

/**
 * Sign this device's `nostr:<npub>` claim into the first save: publishing then
 * finds it already there and does not re-sign — one Face ID for the whole step.
 * No key yet (a restored identity) → no override; the publish adds it later.
 */
async function npubClaimSaveOptions(
  alsoKnownAs: readonly string[],
): Promise<{ readonly alsoKnownAs?: readonly string[] }> {
  const pubkey = await getNostrPubkey();
  if (!pubkey.ok) return {};
  const npub = npubEncode(pubkey.value);
  if (!npub.ok || alsoKnownAs.includes(`nostr:${npub.value}`)) return {};
  return { alsoKnownAs: [...alsoKnownAs, `nostr:${npub.value}`] };
}
