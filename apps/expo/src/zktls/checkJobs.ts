/**
 * Background link checks (docs/ref/10 §2) — the 「驗證」 banner under a Page
 * link row starts one here and the owner never waits on a screen for it.
 *
 *   start   → copies creds.id/@name, opens the platform's bio editor
 *   waiting → the next time the app comes to the foreground the check runs
 *   checking→ this phone fetches the public page and signs (markers are
 *             retried a few times: platforms serve a saved bio late)
 *   found   → confirmed straight away: the owner already asked for the check
 *             when they tapped 「驗證」, so the green check lands with no
 *             second tap; the row's pill comes from the proof store
 *   failed  → the banner names one next action
 *
 * Jobs live outside React, so leaving the Page tab never cancels one.
 */
import * as Clipboard from 'expo-clipboard';
import { AppState, Linking } from 'react-native';
import { create } from 'zustand';

import { haptic } from '@/feedback/haptics';
import { pushToast } from '@/feedback/toast';
import { translate } from '@/i18n';
import { usePreferences } from '@/settings/preferences';
import { getMmkv } from '@/storage/mmkv';
import type { SocialTarget } from '@solidarity/shared';

import { proveSocialTarget, type ProofFailure } from './engine';
import { confirmSocialClaim } from './flow';
import { bioEditUrl, publicProfileUrl } from './links';

export type LinkCheckFailure = ProofFailure | 'signDenied' | 'noName';

export type LinkCheckJob =
  | { readonly phase: 'waiting' }
  | { readonly phase: 'checking'; readonly attempt: number }
  | { readonly phase: 'failed'; readonly failure: LinkCheckFailure };

interface LinkCheckStore {
  readonly jobs: Readonly<Record<string, LinkCheckJob>>;
  /** Claims whose banner the owner closed; the row keeps a quiet 「驗證」. */
  readonly dismissed: readonly string[];
}

const DISMISSED_KEY = 'linkCheck:dismissed:v1';
/** Platforms serve a just-saved bio after a short delay; retry the marker this often. */
const MARKER_RETRIES = 3;
const MARKER_RETRY_DELAY_MS = 4000;

function readDismissed(): readonly string[] {
  try {
    const raw = getMmkv().getString(DISMISSED_KEY);
    const parsed: unknown = raw === undefined ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export const useLinkChecks = create<LinkCheckStore>(() => ({ jobs: {}, dismissed: readDismissed() }));

export function linkCheckKey(target: SocialTarget): string {
  return `${target.platform}:${target.handle.toLowerCase()}`;
}

function setJob(key: string, job: LinkCheckJob | null): void {
  useLinkChecks.setState((state) => {
    const jobs = Object.fromEntries(Object.entries(state.jobs).filter(([k]) => k !== key));
    return { jobs: job === null ? jobs : { ...jobs, [key]: job } };
  });
}

const targets = new Map<string, SocialTarget>();
const running = new Set<string>();

export function dismissLinkCheck(target: SocialTarget): void {
  const key = linkCheckKey(target);
  const dismissed = [...new Set([...useLinkChecks.getState().dismissed, key])];
  useLinkChecks.setState({ dismissed });
  setJob(key, null);
  try {
    getMmkv().set(DISMISSED_KEY, JSON.stringify(dismissed));
  } catch {
    // Not persisted: the banner comes back next launch, nothing else lost.
  }
}

/** Copy the marker, open the bio editor, and check when the owner returns. */
export async function startLinkCheck(target: SocialTarget): Promise<void> {
  const key = linkCheckKey(target);
  const name = usePreferences.getState().publicPageRegisteredUsername;
  if (name === '') {
    setJob(key, { phase: 'failed', failure: 'noName' });
    return;
  }
  targets.set(key, target);
  await Clipboard.setStringAsync(`creds.id/@${name}`);
  setJob(key, { phase: 'waiting' });
  ensureForegroundListener();
  const editUrl = bioEditUrl(target);
  if (editUrl === null) {
    pushToast(translate('zktls.markerCopied'), 'success');
    return;
  }
  await Linking.openURL(editUrl).catch(() => Linking.openURL(publicProfileUrl(target)).catch(() => undefined));
}

/** Run the check now — 「我已經放好了」, a retry, or the return to the app. */
export async function runLinkCheck(target: SocialTarget): Promise<void> {
  const key = linkCheckKey(target);
  if (running.has(key)) return;
  const name = usePreferences.getState().publicPageRegisteredUsername;
  if (name === '') {
    setJob(key, { phase: 'failed', failure: 'noName' });
    return;
  }
  targets.set(key, target);
  running.add(key);
  try {
    for (let attempt = 1; attempt <= MARKER_RETRIES; attempt++) {
      setJob(key, { phase: 'checking', attempt });
      const result = await proveSocialTarget(target, name);
      if (result.ok) {
        const confirmed = await confirmSocialClaim(result.value);
        if (!confirmed.ok) {
          setJob(key, { phase: 'failed', failure: 'signDenied' });
          return;
        }
        setJob(key, null);
        haptic('success');
        pushToast(translate(confirmed.value.published ? 'zktls.done' : 'zktls.publishPending'), 'success');
        return;
      }
      if (result.error !== 'markerMissing' || attempt === MARKER_RETRIES) {
        setJob(key, { phase: 'failed', failure: result.error });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, MARKER_RETRY_DELAY_MS));
    }
  } finally {
    running.delete(key);
  }
}

let listening = false;

function ensureForegroundListener(): void {
  if (listening) return;
  listening = true;
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    for (const [key, job] of Object.entries(useLinkChecks.getState().jobs)) {
      const target = targets.get(key);
      if (job.phase === 'waiting' && target !== undefined) void runLinkCheck(target);
    }
  });
}
