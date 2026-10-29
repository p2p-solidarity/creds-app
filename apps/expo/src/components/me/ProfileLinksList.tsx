/**
 * Page field rows. Each real link keeps its visibility tier, can be reordered
 * directly from a 44pt drag handle, and earns a status pill only from matching
 * completed verification evidence.
 */
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { fadeUpIn } from '@/feedback/motion';
import { useFocusEffect } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';

import {
  getBadgeStatusCacheRevision,
  readCachedAtprotoResult,
  readCachedNostrResult,
  shouldReverifyBadge,
  subscribeBadgeStatusCache,
} from '@/badges/badgeStatusCache';
import { PressableScale } from '@/components/common/PressableScale';
import { BrandIcon } from '@/components/icons/BrandIcon';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedButton, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { useThemeColors } from '@/constants/useThemeColors';
import { appAlert } from '@/feedback/appAlert';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import { verifyHttpsOwnership, type HttpsOwnershipEvidence } from '@/profile/httpsOwnership';
import { linkDisplay, linkSecondaryLabel } from '@/profile/linkPresentation';
import { visibilityAt, type LinkVisibility } from '@/profile/projection';
import { useProfileStore } from '@/profile/store';
import { SealPill } from '@/components/badges/SealPill';
import { getZktls } from '@solidarity/nitro-attest';
import { socialTargetForLink, type SocialTarget } from '@/zktls/links';
import { proofAge, useZktlsProofs } from '@/zktls/store';
import {
  CREDS_NOTARY_ROOTS,
  normalizeAtprotoHandle,
  pageSocialClaim,
  verifyPageSocialProof,
  type ProfileLink,
  type ProfileRecord,
} from '@solidarity/shared';

import { PageEmptyState } from './PageEmptyState';
import { PageSectionLabel } from './PageSectionLabel';
import {
  FIELD_ROW_HEIGHT,
  FIELD_ROW_STRIDE,
  ICON_TILE_GLYPH,
  ROW_GAP,
  fieldRowStyle,
  iconTileStyle,
  isNostrProfileUrlForNpub,
  recordClaimsAtprotoHandle,
  reorderByIndex,
  verificationPillForStates,
  type RowVerificationPill,
} from './pageRowStyles';
import { pageLinkSections, type PageLinkEntry } from './pageLinkSections';
import { buildProfileShareModel } from './meProfileModel';
import {
  DraggableRow,
  RowDragHandle,
  resetRowDrag,
  useRowDragController,
} from './rowDrag';

export interface ProfileLinksListProps {
  readonly links: readonly ProfileLink[];
  readonly linkVisibility: readonly LinkVisibility[];
  readonly onEdit: () => void;
  /** Opens the tab's single "＋ 新增" sheet (links, sections, attestations). */
  readonly onAdd: () => void;
  readonly onImportLinks?: () => void;
}

export function ProfileLinksList({
  links,
  linkVisibility,
  onEdit,
  onAdd,
  onImportLinks,
}: ProfileLinksListProps): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  const record = useProfileStore((state) => state.record);
  const jws = useProfileStore((state) => state.jws);
  const saveProfile = useProfileStore((state) => state.saveProfile);
  const [orderedLinks, setOrderedLinks] = useState(links);
  const [orderedVisibility, setOrderedVisibility] = useState(linkVisibility);
  const [reordering, setReordering] = useState(false);
  const websiteEvidence = useWebsiteLinkEvidence(record, jws);
  const zktlsStates = useZktlsClaimStates(record);
  const canProve = useMemo(() => getZktls()?.isAvailable === true, []);
  useSyncExternalStore(
    subscribeBadgeStatusCache,
    getBadgeStatusCacheRevision,
    getBadgeStatusCacheRevision,
  );

  useEffect(() => {
    setOrderedLinks(links);
    setOrderedVisibility(linkVisibility);
  }, [linkVisibility, links]);

  const sections = reordering
    ? pageLinkSections(orderedLinks, orderedVisibility)
    : pageLinkSections(links, linkVisibility);

  const openLink = (link: ProfileLink): void => {
    void Linking.openURL(link.url).catch(() => {
      appAlert({ title: t('mePage.linkErrorTitle'), message: t('mePage.linkErrorMessage') });
    });
  };

  const persistReorder = useCallback((sourceIndex: number, destinationIndex: number): void => {
    if (reordering || sourceIndex === destinationIndex || record === null) return;
    const pairs = orderedLinks.map((link, index) => ({
      link,
      visibility: visibilityAt(orderedVisibility, index),
    }));
    const reordered = reorderByIndex(pairs, sourceIndex, destinationIndex);
    if (reordered === pairs) return;
    const nextLinks = reordered.map((entry) => entry.link);
    const nextVisibility = reordered.map((entry) => entry.visibility);
    setOrderedLinks(nextLinks);
    setOrderedVisibility(nextVisibility);
    setReordering(true);
    void saveProfile({
      displayName: record.displayName,
      bio: record.bio,
      links: nextLinks,
      linkVisibility: nextVisibility,
    })
      .then((result) => {
        if (result.ok) return;
        setOrderedLinks(links);
        setOrderedVisibility(linkVisibility);
        pushToast(t('mePage.reorderError'), 'error');
      })
      .catch(() => {
        setOrderedLinks(links);
        setOrderedVisibility(linkVisibility);
        pushToast(t('mePage.reorderError'), 'error');
      })
      .finally(() => {
        setReordering(false);
      });
  }, [linkVisibility, links, orderedLinks, orderedVisibility, record, reordering, saveProfile, t]);

  const pillFor = (link: ProfileLink): RowVerificationPill | null =>
    record === null ? null : linkVerificationPill(link, websiteEvidence, zktlsStates, record);

  // A link the zkTLS engine can prove, with no pill yet, offers 「驗證」(docs/ref/10 §2).
  const verifyTargetFor = (link: ProfileLink): SocialTarget | null =>
    canProve && record !== null && pillFor(link) === null ? socialTargetForLink(link.url) : null;

  // The Page tab's only add button. It lives where the links group ends — in
  // the empty state or under the last row — and opens one sheet for links,
  // sections and attestations alike.
  const addAction = (
    <ThemedButton
      label={t('mePage.add')}
      leadingIcon={<SfIcon name="plus" size={15} color={c.pageBg} />}
      haptic="tap"
      fullWidth
      onPress={onAdd}
    />
  );

  if (links.length === 0) {
    return (
      <View className="gap-3 px-4">
        <PageEmptyState
          title={t('mePage.noLinks')}
          message={t('mePage.noLinksHint')}
          action={addAction}
          {...(onImportLinks
            ? { secondaryAction: { label: t('mePage.importLinks'), onPress: onImportLinks } }
            : {})}
        />
      </View>
    );
  }

  return (
    <View className="gap-5 px-4">
      <LinkRowsSection
        title={t('mePage.publicPage')}
        entries={sections.publicLinks}
        disabled={reordering}
        pillFor={pillFor}
        verifyTargetFor={verifyTargetFor}
        onEdit={onEdit}
        onOpenLink={openLink}
        onReorder={persistReorder}
      />
      <LinkRowsSection
        title={t('mePage.cardOnly')}
        entries={sections.cardOnlyLinks}
        disabled={reordering}
        pillFor={pillFor}
        verifyTargetFor={verifyTargetFor}
        onEdit={onEdit}
        onOpenLink={openLink}
        onReorder={persistReorder}
      />
      {sections.hiddenLinks.length > 0 ? (
        <PressableScale
          haptic="tap"
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={t('mePage.reviewHidden')}
          style={{ ...fieldRowStyle(c.mutedSurface), minHeight: 52 }}>
          <SfIcon name="eye.slash" size={16} color={Colors.text3} />
          <View className="flex-1" style={{ gap: 1 }}>
            <ThemedText variant="bodyMedium">{t('mePage.reviewHidden')}</ThemedText>
            <ThemedText variant="caption" tone="tertiary">
              {t('mePage.hiddenCount', { count: sections.hiddenLinks.length })}
            </ThemedText>
          </View>
          <SfIcon name="chevron.right" size={13} color={Colors.text3} />
        </PressableScale>
      ) : null}
      {addAction}
    </View>
  );
}

/** One contiguous reorderable run of link rows. Each section owns its drag
 * controller — section indices restart at 0, so sharing one across sections
 * would alias rows between them. */
function LinkRowsSection({
  title,
  entries,
  disabled,
  pillFor,
  verifyTargetFor,
  onEdit,
  onOpenLink,
  onReorder,
}: {
  readonly title: string;
  readonly entries: readonly PageLinkEntry[];
  readonly disabled: boolean;
  readonly pillFor: (link: ProfileLink) => RowVerificationPill | null;
  readonly verifyTargetFor: (link: ProfileLink) => SocialTarget | null;
  readonly onEdit: () => void;
  readonly onOpenLink: (link: ProfileLink) => void;
  readonly onReorder: (sourceIndex: number, destinationIndex: number) => void;
}): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  const drag = useRowDragController();
  const reduceMotion = useReducedMotion();
  // Rows cascade in once, when the section first paints. A reorder re-keys
  // the moved rows; replaying the entrance there would blink them out right
  // after the drop, so later mounts skip it.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    setEntered(true);
  }, []);
  if (entries.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      <PageSectionLabel title={title} />
      <View style={{ gap: ROW_GAP }}>
        {entries.map(({ link, sourceIndex }, sectionIndex) => {
          const status = pillFor(link);
          const verifyTarget = status === null ? verifyTargetFor(link) : null;
          return (
            <DraggableRow
              key={`${String(sourceIndex)}-${link.label}-${link.url}`}
              controller={drag}
              index={sectionIndex}
              stride={FIELD_ROW_STRIDE}
              style={{
                ...fieldRowStyle(c.mutedSurface),
                gap: 0,
                paddingVertical: 0,
                paddingHorizontal: 0,
              }}>
              <Animated.View
                entering={entered ? undefined : fadeUpIn(sectionIndex, reduceMotion)}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                <RowDragHandle
                  controller={drag}
                  label={t('mePage.reorderLink', { label: linkDisplay(link.label, link.url).text })}
                  index={sectionIndex}
                  itemCount={entries.length}
                  stride={FIELD_ROW_STRIDE}
                  height={FIELD_ROW_HEIGHT}
                  disabled={disabled}
                  onMove={(destination) => {
                    const target = entries[destination];
                    if (target) onReorder(sourceIndex, target.sourceIndex);
                    // Same-task reset: the committed order and the identity
                    // transforms must reach the UI on the same frame.
                    resetRowDrag(drag);
                  }}
                />
                <PressableScale
                  fill
                  haptic="tap"
                  onPress={onEdit}
                  onLongPress={() => { onOpenLink(link); }}
                  accessibilityRole="button"
                  accessibilityLabel={linkDisplay(link.label, link.url).text}
                  accessibilityHint={t('mePage.editLinkHint')}
                  style={{
                    minHeight: FIELD_ROW_HEIGHT,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 8,
                    paddingRight: 12,
                  }}>
                  <View style={iconTileStyle(c.chipSurface)}>
                    <BrandIcon
                      name={linkDisplay(link.label, link.url).brand}
                      size={ICON_TILE_GLYPH}
                      color={Colors.primaryBlue}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <ThemedText variant="bodyMedium" numberOfLines={1} ellipsizeMode="middle">
                      {linkDisplay(link.label, link.url).text}
                    </ThemedText>
                    {linkSecondaryLabel(link.label, link.url) ? (
                      <ThemedText variant="caption" tone="tertiary" numberOfLines={1}>
                        {linkSecondaryLabel(link.label, link.url)}
                      </ThemedText>
                    ) : null}
                  </View>
                  {status ? (
                    <SealPill
                      state={status}
                      label={t(status === 'verified' ? 'mePage.verified' : 'mePage.needsRecheck')}
                    />
                  ) : null}
                  {verifyTarget ? <VerifyChip target={verifyTarget} /> : null}
                  <SfIcon name="chevron.right" size={13} color={Colors.text3} />
                </PressableScale>
              </Animated.View>
            </DraggableRow>
          );
        })}
      </View>
    </View>
  );
}

function useWebsiteLinkEvidence(
  record: ProfileRecord | null,
  jws: string | null,
): readonly HttpsOwnershipEvidence[] {
  const [evidence, setEvidence] = useState<readonly HttpsOwnershipEvidence[]>([]);
  const shareModel = useMemo(
    () => record && jws ? buildProfileShareModel(record, jws) : null,
    [jws, record],
  );

  useFocusEffect(useCallback(() => {
    let active = true;
    if (record === null || shareModel === null || record.links.length === 0) {
      setEvidence([]);
      return () => { active = false; };
    }
    const profileUrls = [shareModel.offlineUrl, shareModel.shortUrl].filter(
      (url): url is string => url !== null,
    );
    void verifyHttpsOwnership({
      did: record.did,
      links: record.links.map((link) => link.url),
      profileUrls,
    }).then((next) => {
      if (active) setEvidence(next);
    });
    return () => { active = false; };
  }, [record, shareModel]));

  return evidence;
}

/**
 * The pill a field row may show. `null` — say nothing — is the honest default.
 *
 * A pill is drawn only when a cached check ① is still fresh for THIS revision
 * of the record, ② describes an identity the record STILL claims, and ③ maps
 * to a URL that actually identifies that identity. A superseded, expired, or
 * merely coincidental match renders nothing rather than a plausible-looking
 * verdict (Rule 8): the pill is the page's whole trust claim, so it must never
 * outlive the evidence behind it.
 */
function linkVerificationPill(
  link: ProfileLink,
  websiteEvidence: readonly HttpsOwnershipEvidence[],
  zktlsStates: ReadonlyMap<string, 'verified' | 'stale'>,
  record: ProfileRecord,
  nowMs: number = Date.now(),
): RowVerificationPill | null {
  const states: string[] = [];
  const atprotoEntry = readCachedAtprotoResult();
  const nostrEntry = readCachedNostrResult();
  const atproto = atprotoEntry !== null &&
    !shouldReverifyBadge(atprotoEntry.checkedAt, record.updatedAt, nowMs)
    ? atprotoEntry.result
    : undefined;
  const nostr = nostrEntry !== null &&
    !shouldReverifyBadge(nostrEntry.checkedAt, record.updatedAt, nowMs)
    ? nostrEntry.result
    : undefined;
  try {
    const url = new URL(link.url);
    const hostname = url.hostname.toLowerCase().replace(/^www\./u, '');
    const path = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const atprotoHandle = atproto?.evidence.handleClaim;
    if (
      hostname === 'bsky.app' &&
      path[0] === 'profile' &&
      path[1] !== undefined &&
      atproto !== undefined &&
      atprotoHandle !== null &&
      atprotoHandle !== undefined &&
      normalizeAtprotoHandle(path[1]) === normalizeAtprotoHandle(atprotoHandle) &&
      recordClaimsAtprotoHandle(record.alsoKnownAs, atprotoHandle)
    ) {
      states.push(atproto.state);
    }
    const npub = nostr?.npub ?? null;
    if (
      nostr !== undefined &&
      npub !== null &&
      record.alsoKnownAs.includes(`nostr:${npub}`) &&
      isNostrProfileUrlForNpub(url, hostname, path, npub)
    ) {
      states.push(nostr.state);
    }
    if (websiteEvidence.some((item) => item.origin === url.origin)) {
      states.push('verified');
    }
    const target = socialTargetForLink(link.url);
    const zktls = target === null ? undefined : zktlsStates.get(pageSocialClaim(target.platform, target.handle));
    if (zktls !== undefined) states.push(zktls);
  } catch {
    return null;
  }
  return verificationPillForStates(states);
}

/**
 * zkTLS claim → pill state. A stored proof counts only if it STILL verifies
 * against this revision of the Page (claim and npub both present); older than
 * 90 days it asks for a recheck while the background renewal catches up.
 */
function useZktlsClaimStates(record: ProfileRecord | null): ReadonlyMap<string, 'verified' | 'stale'> {
  const proofs = useZktlsProofs((state) => state.proofs);
  return useMemo(() => {
    const states = new Map<string, 'verified' | 'stale'>();
    if (record === null) return states;
    for (const [claim, entry] of Object.entries(proofs)) {
      if (!verifyPageSocialProof(record, entry.proof, { roots: CREDS_NOTARY_ROOTS }).ok) continue;
      states.set(claim, proofAge(entry) === 'lapsed' ? 'stale' : 'verified');
    }
    return states;
  }, [proofs, record]);
}

function VerifyChip({ target }: { readonly target: SocialTarget }): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  return (
    <PressableScale
      haptic="tap"
      onPress={() => {
        router.push({ pathname: '/verify/social', params: { platform: target.platform, handle: target.handle } });
      }}
      accessibilityRole="button"
      accessibilityLabel={t('zktls.verifyLink')}
      hitSlop={8}
      style={{
        paddingVertical: 5,
        paddingHorizontal: 11,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: c.primaryBlue,
      }}>
      <ThemedText variant="caption" style={{ color: c.primaryBlue }}>
        {t('zktls.verifyLink')}
      </ThemedText>
    </PressableScale>
  );
}
