/**
 * A saved credential lives in two stores: the credential record, and (for a
 * passport) the identity card plus the claims the Page lists — both keyed by
 * the credential's id. Removing only the record left the Page showing claims
 * whose detail page then read 「找不到證明」.
 */
import { useIdentityData } from '@/identity';

import { useCredentialStore } from './store';

export async function removeCredentialAndClaims(id: string): Promise<void> {
  const identity = useIdentityData.getState();
  await identity.hydrate();
  for (const claim of identity.provableClaims.filter((c) => c.identityCardId === id)) {
    await identity.removeProvableClaim(claim.id);
  }
  if (identity.identityCards.some((card) => card.id === id)) await identity.removeIdentityCard(id);
  await useCredentialStore.getState().remove(id);
}

/**
 * Drop identity cards and claims whose credential is gone (left behind by the
 * record-only remove above, before it removed both). Waits for both stores to
 * load fully, so a not-yet-hydrated store never reads as "everything deleted".
 */
export async function sweepOrphanedClaims(): Promise<void> {
  await useCredentialStore.getState().hydrate();
  await useIdentityData.getState().hydrate();
  const credentials = useCredentialStore.getState();
  if (!credentials.detailsHydrated) return;
  const live = new Set(credentials.manifest.map((entry) => entry.id));
  const identity = useIdentityData.getState();
  for (const claim of identity.provableClaims) {
    if (!live.has(claim.identityCardId)) await identity.removeProvableClaim(claim.id);
  }
  for (const card of identity.identityCards) {
    if (!live.has(card.id)) await identity.removeIdentityCard(card.id);
  }
}
