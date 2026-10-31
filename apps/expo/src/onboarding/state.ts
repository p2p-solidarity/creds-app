/**
 * v2 onboarding state machine. The five entries map one-to-one to the five
 * dots in v2.html; cryptographic setup stays inside the passkey step instead
 * of becoming user-facing protocol screens.
 */
export const ONBOARDING_STEPS = [
  'welcome',
  'username',
  'passkey',
  'links',
  'complete',
] as const;

export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingState {
  readonly step: OnboardingStep;
  readonly keysGenerated: boolean;
}

export const initialOnboardingState: OnboardingState = {
  step: 'welcome',
  keysGenerated: false,
};

/**
 * The state to open onboarding on: a saved unfinished run (iPad users get
 * switched away mid-flow; a relaunch used to restart at welcome while the
 * name draft survived), else the start. A step name the current build no
 * longer has falls back to the start.
 */
export function resumeOnboardingState(saved: OnboardingState | null): OnboardingState {
  if (saved === null || !ONBOARDING_STEPS.includes(saved.step)) return initialOnboardingState;
  return { step: saved.step, keysGenerated: saved.keysGenerated };
}

export type OnboardingAction =
  | { readonly type: 'next' }
  | { readonly type: 'back' }
  | { readonly type: 'goTo'; readonly step: OnboardingStep }
  | { readonly type: 'setKeysGenerated'; readonly value: boolean };

function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

export function onboardingReducer(
  state: OnboardingState,
  action: OnboardingAction,
): OnboardingState {
  switch (action.type) {
    case 'next':
      return {
        ...state,
        step:
          ONBOARDING_STEPS[
            Math.min(stepIndex(state.step) + 1, ONBOARDING_STEPS.length - 1)
          ] ?? 'complete',
      };
    case 'back':
      return {
        ...state,
        step: ONBOARDING_STEPS[Math.max(stepIndex(state.step) - 1, 0)] ?? 'welcome',
      };
    case 'goTo':
      return { ...state, step: action.step };
    case 'setKeysGenerated':
      return { ...state, keysGenerated: action.value };
  }
}
