/**
 * The Page's one publish flow — sign the edited design locally (only when it
 * moved), then publish to Nostr — shared by the 區塊 list and the 設計 sheet so
 * both show the same `PublishChangesCard` and the same honest state: "live"
 * only once relays have actually taken the new record.
 */
import { useMemo, useState } from 'react';

import { useTranslation } from '@/i18n';
import {
  isBiometricCancellation,
  isNostrPublishOutcomePartiallyAccepted,
  isNostrPublishOutcomeSuccessful,
  publishWithNostrAutoSetup,
} from '@/nostr/connectWizard';
import { DEFAULT_RELAYS } from '@/nostr/publish';
import { hasNostrKey, provisionFromRootMnemonic } from '@/nostr/userKey';
import { createInitialPageDesign, publicPageDesignEquals, toPublicPageDesign } from '@/page/pageDesign';
import { usePageDesignStore } from '@/page/pageDesignStore';
import { haptic } from '@/feedback/haptics';
import { useProfileStore } from '@/profile/store';
import type { PublicPageDesign } from '@solidarity/shared';

import type { PublishCardState } from './PublishChangesCard';
import { pagePublishProblem } from './publishProblem';

type PublishResult = 'idle' | 'done' | 'partial' | 'unpublished' | 'saveError' | 'relayError';

export interface PagePublish {
  /** Whether a card belongs on screen at all (changes, or a result to show). */
  readonly showCard: boolean;
  readonly cardState: PublishCardState;
  readonly publish: () => void;
  readonly dismiss: () => void;
}

export function usePagePublish(handle: string | null): PagePublish {
  const { t } = useTranslation();
  const status = usePageDesignStore((state) => state.status);
  const design = usePageDesignStore((state) => state.design);
  const record = useProfileStore((state) => state.record);
  const published = useProfileStore((state) => state.published);
  const nostrPublishedJws = useProfileStore((state) => state.nostrPublishedJws);
  const [publishing, setPublishing] = useState(false);
  // What the last publish actually did. `done` / `partial` stay until
  // dismissed or the next edit; the others until the next try. Everything
  // after a successful local sign (`unpublished`, `relayError`) keeps the
  // card up even though the signed record already matches the editor.
  const [result, setResult] = useState<PublishResult>('idle');
  const publishedDesign = record?.page ?? toPublicPageDesign(createInitialPageDesign());
  const pageHasChanges = status === 'ready' && record !== null && !publicPageDesignEquals(
    toPublicPageDesign(design),
    publishedDesign,
  );
  // Signed here but never confirmed on a relay (an earlier local-only save,
  // or a publish that failed): visitors still get the older Page.
  const pageNotLive = record !== null && published !== null && nostrPublishedJws !== published.jws;
  const needsPublish = pageHasChanges || pageNotLive;
  const problem = useMemo(
    () => (pageHasChanges && record !== null ? pagePublishProblem(toPublicPageDesign(design), record.links, t) : null),
    [pageHasChanges, record, design, t],
  );

  const publish = (): void => {
    if (publishing || !record || status !== 'ready' || problem !== null) return;
    setPublishing(true);
    void signAndPublishPage(pageHasChanges ? toPublicPageDesign(design) : null)
      .then((next) => {
        if (next === 'done' || next === 'partial') haptic('success');
        else if (next !== 'unpublished') haptic('error');
        setResult(next);
      })
      .catch(() => {
        haptic('error');
        setResult('relayError');
      })
      .finally(() => { setPublishing(false); });
  };

  return {
    showCard: status === 'ready' && (needsPublish || result !== 'idle'),
    cardState: problem !== null && !publishing
      ? { kind: 'blocked', problem }
      : publishCardState(publishing, pageHasChanges, needsPublish, result, handle),
    publish,
    dismiss: () => { setResult('idle'); },
  };
}

async function signAndPublishPage(page: PublicPageDesign | null): Promise<PublishResult> {
  const { savePageDesign, publishToNostr } = useProfileStore.getState();
  if (page !== null) {
    const saved = await savePageDesign(page);
    if (!saved.ok) return isBiometricCancellation(saved.error) ? 'idle' : 'saveError';
  }
  const published = await publishWithNostrAutoSetup({
    hasKey: hasNostrKey,
    provision: provisionFromRootMnemonic,
    publish: async () => await publishToNostr(DEFAULT_RELAYS),
  });
  if (!published.ok) return isBiometricCancellation(published.error) ? 'unpublished' : 'relayError';
  if (isNostrPublishOutcomeSuccessful(published.value)) return 'done';
  return isNostrPublishOutcomePartiallyAccepted(published.value) ? 'partial' : 'relayError';
}

function publishCardState(
  publishing: boolean,
  pageHasChanges: boolean,
  needsPublish: boolean,
  result: PublishResult,
  handle: string | null,
): PublishCardState {
  if (publishing) return { kind: 'publishing' };
  if (result === 'saveError' && pageHasChanges) return { kind: 'error', reason: 'save' };
  if (result === 'relayError') return { kind: 'error', reason: 'relay' };
  if (needsPublish || result === 'unpublished' || result === 'idle') return { kind: 'pending' };
  return { kind: 'done', handle, partial: result === 'partial' };
}
