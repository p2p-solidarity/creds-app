import { router } from 'expo-router';

import { capabilities } from '@/platform/distribution';

import { useIsPro } from './entitlementStore';

export interface ProGate {
  /** Whether the current user is entitled (includes the offline grace window).
   *  Never true because of the distribution — non-design Pro features read this. */
  readonly isPro: boolean;
  /** Page-design controls are open: the user is Pro, or this distribution
   *  gives design to everyone (F-Droid, `src/platform/distribution.ts`). */
  readonly designUnlocked: boolean;
  /** True when a page-design control that requires Pro must be locked. */
  readonly locked: (requiresPro: boolean) => boolean;
  /** Send the user to the paywall. The only thing a locked control does. */
  readonly openUpgrade: () => void;
}

/**
 * The single place a Pro feature gate is expressed. Every control gated here
 * today is page design (appearance, Pro blocks), so `locked` follows
 * `designUnlocked`.
 *
 * Locking only ever affects *controls*. A block or style a subscriber already
 * applied stays in their design and stays published after a lapse — see
 * `entitlement.ts` rule 1. Nothing that reads this hook may delete or rewrite
 * user content on downgrade.
 */
export function useProGate(): ProGate {
  const isPro = useIsPro();
  const designUnlocked = isPro || capabilities.designUnlockedByDistribution;
  return {
    isPro,
    designUnlocked,
    locked: (requiresPro: boolean) => requiresPro && !designUnlocked,
    openUpgrade: () => {
      router.push('/settings/pro');
    },
  };
}
