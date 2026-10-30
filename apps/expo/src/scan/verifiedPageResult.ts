/**
 * Verified Page result — presentation store for `VerifiedPageResultSheet`
 * (1.3.3 Task A2.3, US-11). Mirrors `src/cards/receivedCard.ts`'s
 * "present(payload) -> a globally-mounted sheet reacts" pattern so the
 * sheet works identically whether the payload arrived via the in-app
 * scanner (`app/scan/index.tsx`) or a universal/deep link handled while the
 * app is already on some other screen (`src/deeplink/router.ts`) — neither
 * caller has to know or care where the sheet is mounted.
 */
import { create } from 'zustand';

import type { VerifiedPageResult } from './verifiedPageHandler';

interface VerifiedPageResultState {
  readonly result: VerifiedPageResult | null;
  /**
   * True while a `#nostr:<npub>` short pointer is being resolved against
   * relays (`resolveProfile.ts`) — an async round-trip the sync fragment
   * path never needs. The sheet shows a spinner; `present(result)` then
   * swaps in the resolved verdict. `false` for every fragment payload
   * (those verify synchronously, so `result` is set in the same tick).
   */
  readonly resolving: boolean;
  /** Bumped by every present/dismiss, so a late relay answer can tell it lost the sheet. */
  readonly ticket: number;
  readonly present: (result: VerifiedPageResult) => void;
  readonly presentResolving: () => number;
  readonly presentFor: (ticket: number, result: VerifiedPageResult) => void;
  readonly dismiss: () => void;
}

export const useVerifiedPageResult = create<VerifiedPageResultState>((set, get) => ({
  result: null,
  resolving: false,
  ticket: 0,
  present: (result) => {
    set({ result, resolving: false, ticket: get().ticket + 1 });
  },
  presentResolving: () => {
    const ticket = get().ticket + 1;
    set({ result: null, resolving: true, ticket });
    return ticket;
  },
  presentFor: (ticket, result) => {
    if (get().ticket !== ticket) return;
    set({ result, resolving: false });
  },
  dismiss: () => {
    set({ result: null, resolving: false, ticket: get().ticket + 1 });
  },
}));

export function presentVerifiedPageResult(result: VerifiedPageResult): void {
  useVerifiedPageResult.getState().present(result);
}

/**
 * Open the sheet in its loading state while a `#nostr:` pointer or handle
 * resolves. Returns the presenter for this resolution: call it with the first
 * relay's page and again with the final verdict. Once the sheet is dismissed
 * or another code is presented, it does nothing — a slow relay never reopens
 * a sheet the user already closed.
 */
export function presentVerifiedPageResolving(): (result: VerifiedPageResult) => void {
  const ticket = useVerifiedPageResult.getState().presentResolving();
  return (result) => {
    useVerifiedPageResult.getState().presentFor(ticket, result);
  };
}
