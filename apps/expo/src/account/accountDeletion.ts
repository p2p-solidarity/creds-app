/**
 * Account deletion (App Store 5.1.1(v), Play account deletion): everything
 * creds holds for this identity off the phone, then the phone itself.
 *
 * Every server step is signed by a key that lives only on this device, so the
 * local wipe runs LAST and only when every server step succeeded — wiping
 * first would make a failed step impossible to retry. All server steps are
 * idempotent: a retry repeats the whole list and the ones already done
 * succeed again (or find nothing, which is also success).
 *
 * The result names steps only. Underlying errors can carry identifiers and
 * never cross into UI copy or logs.
 */
export const ACCOUNT_DELETION_STEPS = ['nostr', 'name', 'vault', 'pro', 'inbox', 'local'] as const;
export type AccountDeletionStep = (typeof ACCOUNT_DELETION_STEPS)[number];
export type ServerDeletionStep = Exclude<AccountDeletionStep, 'local'>;

export type StepOutcome =
  | { readonly kind: 'done' }
  /** Nothing to delete: this device never held the key that step needs. */
  | { readonly kind: 'nothing' }
  | { readonly kind: 'failed' }
  /** Not attempted, because a server step failed (local wipe only). */
  | { readonly kind: 'notRun' };

export type StepRunResult = { readonly kind: 'done' } | { readonly kind: 'nothing' } | { readonly kind: 'failed' };

export type AccountDeletionDeps = Readonly<Record<AccountDeletionStep, () => Promise<StepRunResult>>>;

export type AccountDeletionResult =
  | { readonly kind: 'deleted'; readonly steps: Readonly<Record<AccountDeletionStep, StepOutcome>> }
  | {
      readonly kind: 'incomplete';
      readonly failed: readonly AccountDeletionStep[];
      readonly steps: Readonly<Record<AccountDeletionStep, StepOutcome>>;
    };

const SERVER_STEPS: readonly ServerDeletionStep[] = ['nostr', 'name', 'vault', 'pro', 'inbox'];

async function attempt(run: () => Promise<StepRunResult>): Promise<StepOutcome> {
  try {
    return await run();
  } catch {
    return { kind: 'failed' };
  }
}

export async function runAccountDeletion(
  deps: AccountDeletionDeps,
  /** Called as each step starts, with the outcomes so far. */
  onProgress?: (step: AccountDeletionStep, done: Readonly<Partial<Record<AccountDeletionStep, StepOutcome>>>) => void,
): Promise<AccountDeletionResult> {
  const steps = {} as Record<AccountDeletionStep, StepOutcome>;
  // Sequential on purpose: the Nostr cleanup and the name erase share one
  // signing key, and a progress list that ticks in order is what the user reads.
  for (const step of SERVER_STEPS) {
    onProgress?.(step, { ...steps });
    steps[step] = await attempt(deps[step]);
  }
  const serverFailed = SERVER_STEPS.filter((step) => steps[step].kind === 'failed');
  if (serverFailed.length > 0) {
    steps.local = { kind: 'notRun' };
    return { kind: 'incomplete', failed: serverFailed, steps };
  }
  onProgress?.('local', { ...steps });
  steps.local = await attempt(deps.local);
  return steps.local.kind === 'failed'
    ? { kind: 'incomplete', failed: ['local'], steps }
    : { kind: 'deleted', steps };
}
