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
import { ActivityIndicator, Linking, View } from 'react-native';
import { router } from 'expo-router';

import {
  getBadgeStatusCacheRevision,
  readCachedAtprotoResult,
  readCachedNostrResult,
  shouldReverifyBadge,
  subscribeBadgeStatusCache,
} from '@/badges/badgeStatusCache';
import { PressableScale } from '@/components/common/PressableScale';
import { LinkIcon } from '@/components/icons/LinkIcon';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedButton, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { useThemeColors } from '@/constants/useThemeColors';
import { Radius } from '@/constants/radius';
import { appAlert } from '@/feedback/appAlert';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import { verifyHttpsOwnership, type HttpsOwnershipEvidence } from '@/profile/httpsOwnership';
import { linkDisplay, linkSecondaryLabel } from '@/profile/linkPresentation';
import { visibilityAt, type LinkVisibility } from '@/profile/projection';
import { useProfileStore } from '@/profile/store';
import { SealPill } from '@/components/badges/SealPill';
import { socialTargetForLink, type SocialTarget } from '@solidarity/shared';
import { deviceAttestSupported } from '@/witness/deviceKey';
import { proofAge, useZktlsProofs } from '@/zktls/store';
import {
  dismissLinkCheck,
  linkCheckKey,
  runLinkCheck,
  startLinkCheck,
  useLinkChecks,
  type LinkCheckJob,
} from '@/zktls/checkJobs';
import { FAILURE_KEY } from '@/components/verify/SocialVerifyPanel';
import {
  CREDS_DEVICE_TRUST,
  normalizeAtprotoHandle,
  pageSocialClaim,
  verifyWitness,
  type NostrEvent as SharedNostrEvent,
  type ProfileLink,
  type ProfileRecord,
} from '@solidarity/shared';

import { LinkActionSheet, type LinkSheetAction } from './LinkActionSheet';
import { PageEmptyState } from './PageEmptyState';
import { PageSectionLabel } from './PageSectionLabel';
import {
  FIELD_ROW_STRIDE,
  ICON_TILE_GLYPH,
  ROW_GAP,
  fieldRowStyle,
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
  /** Opens the Page's one "＋ 新增" sheet (links, music, forms, sections, proofs). */
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
  const canProve = useMemo(() => deviceAttestSupported(), []);
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

  // Linktree's one big "+ Add": links, music, forms, sections and proofs all
  // start from the same sheet.
  const addAction = (
    <ThemedButton label={t('mePage.add')} icon="plus" haptic="tap" fullWidth onPress={onAdd} />
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
      {addAction}
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
          style={{ ...fieldRowStyle(c), minHeight: 52 }}>
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
    </View>
  );
}

/** One contiguous reorderable run of link rows. Each section owns its drag
 * controller — section indices restart at 0, so sharing one across sections
 * would alias rows between them. Rows are Linktree-style cards: the avatar is
 * the drag grip, the card opens the editor, ⋮ holds the rest, and a link this
 * phone can check carries its 「驗證」 banner right under it. */
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
  const jobs = useLinkChecks((state) => state.jobs);
  const dismissed = useLinkChecks((state) => state.dismissed);
  // Rows cascade in once, when the section first paints. A reorder re-keys
  // the moved rows; replaying the entrance there would blink them out right
  // after the drop, so later mounts skip it.
  const [entered, setEntered] = useState(false);
  const [menu, setMenu] = useState<{ readonly link: ProfileLink; readonly actions: readonly LinkSheetAction[] } | null>(null);
  useEffect(() => {
    setEntered(true);
  }, []);
  if (entries.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      <LinkActionSheet link={menu?.link ?? null} actions={menu?.actions ?? []} onClose={() => { setMenu(null); }} />
      <PageSectionLabel title={title} />
      <View style={{ gap: ROW_GAP }}>
        {entries.map(({ link, sourceIndex }, sectionIndex) => {
          const status = pillFor(link);
          const verifyTarget = status === null ? verifyTargetFor(link) : null;
          const checkKey = verifyTarget === null ? null : linkCheckKey(verifyTarget);
          const job = checkKey === null ? undefined : jobs[checkKey];
          const showBanner = verifyTarget !== null && (job !== undefined || !dismissed.includes(checkKey ?? ''));
          const display = linkDisplay(link.label, link.url).text;
          const openMenu = (): void => {
            setMenu({
              link,
              actions: [
                { icon: 'arrow.up.right', label: t('mePage.linkMenu.open'), onPress: () => { onOpenLink(link); } },
                { icon: 'pencil', label: t('mePage.linkMenu.edit'), onPress: onEdit },
                ...(verifyTarget !== null && !showBanner
                  ? [{
                      icon: 'checkmark.seal' as const,
                      label: t('zktls.verifyLink'),
                      onPress: () => { void startLinkCheck(verifyTarget); },
                    }]
                  : []),
              ],
            });
          };
          return (
            <DraggableRow
              key={`${String(sourceIndex)}-${link.label}-${link.url}`}
              controller={drag}
              index={sectionIndex}
              stride={FIELD_ROW_STRIDE}
              style={{
                borderRadius: Radius.card,
                borderWidth: 1,
                borderColor: c.divider,
                backgroundColor: c.cardBg,
                overflow: 'hidden',
              }}>
              <Animated.View entering={entered ? undefined : fadeUpIn(sectionIndex, reduceMotion)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: LINK_CARD_HEIGHT }}>
                  <RowDragHandle
                    controller={drag}
                    label={t('mePage.reorderLink', { label: display })}
                    index={sectionIndex}
                    itemCount={entries.length}
                    stride={FIELD_ROW_STRIDE}
                    height={LINK_CARD_HEIGHT}
                    width={LINK_AVATAR_SIZE + 24}
                    disabled={disabled}
                    onMove={(destination) => {
                      const target = entries[destination];
                      if (target) onReorder(sourceIndex, target.sourceIndex);
                      // Same-task reset: the committed order and the identity
                      // transforms must reach the UI on the same frame.
                      resetRowDrag(drag);
                    }}>
                    <LinkIcon
                      label={link.label}
                      url={link.url}
                      size={LINK_AVATAR_SIZE}
                      glyph={ICON_TILE_GLYPH}
                      surface={c.chipSurface}
                    />
                  </RowDragHandle>
                  <PressableScale
                    fill
                    haptic="tap"
                    onPress={onEdit}
                    onLongPress={() => { onOpenLink(link); }}
                    accessibilityRole="button"
                    accessibilityLabel={display}
                    accessibilityHint={t('mePage.editLinkHint')}
                    style={{
                      minHeight: LINK_CARD_HEIGHT,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingVertical: 10,
                    }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <ThemedText variant="titleMedium" numberOfLines={1} ellipsizeMode="middle">
                        {display}
                      </ThemedText>
                      <ThemedText variant="caption" tone="tertiary" numberOfLines={1}>
                        {linkSecondaryLabel(link.label, link.url) ?? link.url.replace(/^https?:\/\//u, '')}
                      </ThemedText>
                    </View>
                    {status ? (
                      <SealPill
                        state={status}
                        label={t(status === 'verified' ? 'mePage.verified' : 'mePage.needsRecheck')}
                      />
                    ) : null}
                  </PressableScale>
                  <PressableScale
                    haptic="tap"
                    onPress={openMenu}
                    accessibilityRole="button"
                    accessibilityLabel={t('mePage.linkMenu.more', { label: display })}
                    style={{ width: 44, height: LINK_CARD_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
                    <SfIcon name="ellipsis" size={16} color={c.text2} />
                  </PressableScale>
                </View>
                {showBanner ? (
                  <LinkVerifyBanner target={verifyTarget} job={job} />
                ) : null}
              </Animated.View>
            </DraggableRow>
          );
        })}
      </View>
    </View>
  );
}

/** Link card geometry: a 44pt avatar, Linktree-sized. */
const LINK_AVATAR_SIZE = 44;
const LINK_CARD_HEIGHT = 68;

/**
 * The 「驗證」 banner under a link row (Linktree's "Finish connecting"): one
 * tap copies the marker and opens the platform; the check itself runs in
 * the background (`@/zktls/checkJobs`) and the row's pill appears when done.
 */
function LinkVerifyBanner({
  target,
  job,
}: {
  readonly target: SocialTarget;
  readonly job: LinkCheckJob | undefined;
}): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  const reduceMotion = useReducedMotion();
  const platform = t(`zktls.platform.${target.platform}`);

  let message: string;
  let action: { readonly label: string; readonly onPress: () => void } | null;
  let busy = false;
  if (job === undefined) {
    message = t('mePage.linkVerify.prompt', { platform });
    action = { label: t('mePage.linkVerify.action', { platform }), onPress: () => { void startLinkCheck(target); } };
  } else if (job.phase === 'waiting') {
    message = t(target.platform === 'x' ? 'zktls.waitingX' : 'zktls.waiting', { platform });
    action = { label: t('zktls.alreadyAdded'), onPress: () => { void runLinkCheck(target); } };
  } else if (job.phase === 'checking') {
    message = `${t('zktls.proving', { platform })} ${t(job.attempt > 1 ? 'zktls.provingRetry' : 'mePage.linkVerify.background')}`;
    action = null;
    busy = true;
  } else {
    message = t(FAILURE_KEY[job.failure], { platform });
    action = job.failure === 'noName'
      ? { label: t('zktls.claimName'), onPress: () => { router.push('/settings/username'); } }
      : job.failure === 'noNostrKey'
        ? { label: t('zktls.setupNostr'), onPress: () => { router.push('/verify/nostr'); } }
        : job.failure === 'unsupported' || job.failure === 'deviceRejected'
          ? null
          : { label: t('zktls.retry'), onPress: () => { void runLinkCheck(target); } };
  }

  return (
    <Animated.View
      key={job?.phase ?? 'idle'}
      entering={fadeUpIn(0, reduceMotion)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 12,
        paddingLeft: 14,
        paddingRight: 6,
        backgroundColor: c.chipSurface,
        borderTopWidth: 1,
        borderTopColor: c.divider,
      }}>
      {busy ? <ActivityIndicator size="small" color={c.primaryBlue} /> : null}
      <ThemedText variant="bodySmall" style={{ flex: 1 }}>
        {message}
      </ThemedText>
      {action ? (
        <ThemedButton label={action.label} variant="secondary" size="sm" haptic="tap" onPress={action.onPress} />
      ) : null}
      <PressableScale
        haptic="tap"
        onPress={() => { dismissLinkCheck(target); }}
        accessibilityRole="button"
        accessibilityLabel={t('mePage.linkVerify.dismiss')}
        style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
        <SfIcon name="xmark" size={13} color={c.text2} />
      </PressableScale>
    </Animated.View>
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
 * Link claim → pill state. A stored self-check counts only if it STILL
 * verifies against this revision of the Page (claim and npub both present); older than
 * 90 days it asks for a recheck while the background renewal catches up.
 */
function useZktlsClaimStates(record: ProfileRecord | null): ReadonlyMap<string, 'verified' | 'stale'> {
  const proofs = useZktlsProofs((state) => state.proofs);
  return useMemo(() => {
    const states = new Map<string, 'verified' | 'stale'>();
    if (record === null) return states;
    for (const [claim, entry] of Object.entries(proofs)) {
      const w = verifyWitness(entry.event as SharedNostrEvent, CREDS_DEVICE_TRUST);
      if (!w.ok || !w.value.self || w.value.statement.claim !== claim) continue;
      if (!record.alsoKnownAs.includes(claim) || !record.alsoKnownAs.includes(`nostr:${w.value.statement.subject}`)) continue;
      states.set(claim, proofAge(entry) === 'lapsed' ? 'stale' : 'verified');
    }
    return states;
  }, [proofs, record]);
}
