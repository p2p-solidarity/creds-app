/**
 * Biometric gate — wraps expo-local-authentication.
 *
 * Per project CLAUDE.md (Sec rules): Face ID is required for passport save,
 * exchange, sign, present, delete, and export. We funnel all biometric
 * prompts through this module so the prompt text is consistent and so we
 * can centralise opt-out (e.g. dev mode, accessibility) in one place.
 */
import * as LocalAuthentication from 'expo-local-authentication';

import type { NativeSignSession } from './nativeSignSession';

export type BiometricReason =
  | 'sign'
  | 'export'
  | 'present'
  | 'delete'
  | 'exchange'
  | 'passportSave'
  | 'cardRelease';

const PROMPT_BY_REASON: Readonly<Record<BiometricReason, string>> = {
  sign: 'Authorize signing with your identity key',
  export: 'Authorize exporting your private data',
  present: 'Authorize presenting your credentials',
  delete: 'Authorize deleting protected items',
  exchange: 'Authorize a peer credential exchange',
  passportSave: 'Authorize saving your passport credential',
  cardRelease: 'Approve sharing your card',
};

/** Check whether the device supports Face ID / Touch ID / Iris and is enrolled. */
export async function isBiometricAvailable(): Promise<boolean> {
  const [hasHw, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hasHw && isEnrolled;
}

/**
 * Shared session grace (aggressive policy, 2026-06-13 — see
 * docs/superpowers/plans/2026-06-13-faceid-single-gate-phase4.md).
 *
 * ONE bucket covers the whole non-destructive family: a successful
 * authorization for sign / export / present / passportSave / exchange
 * silences the entire family for `GRACE_MS` — one Face ID per user session,
 * not one per operation. `'delete'` and `'cardRelease'` are always-prompt
 * reasons: destructive actions and remote-peer credential release re-auth
 * every time and never arm the bucket.
 *
 * `'cardRelease'` is a DEDICATED reason (task A5.2 round 2) for the Pear
 * responder's card-release gate — it hands a signed credential to a REMOTE
 * peer, a peer-scoped consent decision, not a same-device, same-session
 * action like `sign`/`export`/`present`/`exchange`. Riding a grace window
 * armed by an unrelated `sign` a few minutes earlier (e.g. the mutual
 * handshake that necessarily precedes any Pear card exchange) would let a
 * `card.request` release the card with NO live Face ID at all, so
 * `cardRelease` always live-prompts and never arms the bucket.
 *
 * Round 1 of this fix moved the existing `'exchange'` reason into
 * `ALWAYS_PROMPT` instead of adding a new reason. That was wrong: `'exchange'`
 * is ALSO used by `vault/secretsKeychain.ts`'s root-secret unwrap gate
 * (reached from local vault unlock, not a remote peer at all), so vault
 * unlock silently lost its 5-minute grace and started live-prompting on
 * every unlock — an unintended UX regression on a shipped, purely-local
 * feature. Round 2 introduces `'cardRelease'` for the Pear path and returns
 * `'exchange'` to the graced family so vault unlock behaves as before.
 *
 * `biometricGatekeeper.requireSensitiveAction` shares this bucket via
 * `armBiometricGrace()` / `hasBiometricGrace()`, so an OID4VP
 * `presentProof` gate also covers the `sign` inside `buildVpToken`.
 *
 * Time-based so it always auto-expires; call `resetBiometricGrace()` on
 * sign-out / app background for a hard reset.
 */
const GRACE_MS = 5 * 60 * 1000;
const ALWAYS_PROMPT: ReadonlySet<BiometricReason> = new Set(['delete', 'cardRelease']);
let graceUntil = 0;
let gracedPromptInFlight: Promise<AuthOutcome> | null = null;
/**
 * Bumped by every reset. A sheet that was already on screen when the grace was
 * reset must not re-open the window when it later succeeds — a reset means
 * "the next action needs a prompt shown after this point".
 */
let graceGeneration = 0;

/**
 * Master switch for the grace window, driven by the user's gate mode
 * (`sensitiveActionPolicy.ts`). `'everyTime'` sets this false.
 *
 * It lives HERE rather than in the gatekeeper because the grace bucket is
 * shared by both gates: `requireBiometric` (this module, used by the vault,
 * passport, signing and Pear paths) and `requireSensitiveAction`. Gating only
 * the latter would leave "ask every time" silently untrue on most of the app.
 */
let graceEnabled = true;

/**
 * Enable/disable the shared grace window. Disabling also drops any window
 * already open, so switching to "ask every time" takes effect immediately
 * instead of after the current five minutes elapse.
 */
export function setBiometricGraceEnabled(enabled: boolean): void {
  graceEnabled = enabled;
  if (!enabled) {
    graceUntil = 0;
    graceGeneration += 1;
    resetNativeSignSession();
  }
}

/** Whether the grace window is allowed at all under the current gate mode. */
export function isBiometricGraceEnabled(): boolean {
  return graceEnabled;
}

/**
 * Drop any active grace so the next sensitive action re-prompts. Also drops
 * the native sign context of a legacy native-ACL key, so neither window
 * outlives the other.
 */
export function resetBiometricGrace(): void {
  graceUntil = 0;
  graceGeneration += 1;
  gracedPromptInFlight = null;
  resetNativeSignSession();
}

/** Open the shared grace window (called after any equivalent gate succeeds). */
export function armBiometricGrace(): void {
  if (!graceEnabled) return;
  graceUntil = Date.now() + GRACE_MS;
}

/** Whether the shared grace window is currently open. */
export function hasBiometricGrace(): boolean {
  return graceEnabled && Date.now() < graceUntil;
}

/**
 * Prompt the user. Resolves to `true` on success, `false` on cancel/fail.
 * Callers should treat false as "user denied" and abort the sensitive op.
 */
export async function requireBiometric(reason: BiometricReason): Promise<boolean> {
  if (ALWAYS_PROMPT.has(reason)) {
    return (await promptOnce(PROMPT_BY_REASON[reason])).success;
  }
  if (hasBiometricGrace()) return true;
  return (await promptForGrace(PROMPT_BY_REASON[reason])).success;
}

/** What the OS sheet answered. `error` is an expo-local-authentication code. */
export interface AuthOutcome {
  readonly success: boolean;
  readonly error?: string;
}

/**
 * The ONE live prompt behind every graced gate (`requireBiometric` here and
 * `requireSensitiveAction` in the gatekeeper). Success arms the shared bucket.
 *
 * Concurrent callers share the sheet that is already up: two signers racing
 * (a Page save and a QR build) must not stack two OS sheets for one moment of
 * user presence. This is a concurrency guard, not a grace window — it stays on
 * in every mode, `everyTime` included. Red-line / always-prompt actions never
 * join it (they use `promptOnce`): their prompt names a different, stronger
 * intent, and their success must not open the family window.
 *
 * When the device key is a legacy native-ACL key, the prompt runs on the
 * native sign context (`nativeSignSession.ts`), so the same Face ID also
 * authorizes the next native signatures — one sheet, both windows.
 */
export function promptForGrace(promptMessage: string): Promise<AuthOutcome> {
  if (gracedPromptInFlight) return gracedPromptInFlight;
  const generation = graceGeneration;
  const attempt = osPrompt(promptMessage, { shareWithNativeSession: true }).then((outcome) => {
    if (outcome.success && generation === graceGeneration) armBiometricGrace();
    return outcome;
  });
  const tracked = attempt.finally(() => {
    if (gracedPromptInFlight === tracked) gracedPromptInFlight = null;
  });
  gracedPromptInFlight = tracked;
  return tracked;
}

/** A live prompt that neither coalesces nor arms anything (red line, Pear release). */
export function promptOnce(promptMessage: string): Promise<AuthOutcome> {
  return osPrompt(promptMessage, { shareWithNativeSession: false });
}

type NativeSessionResolver = () => Promise<NativeSignSession | null>;

const defaultNativeSessionResolver: NativeSessionResolver = async () => {
  const { nativeSignSession } = await import('./nativeSignSession');
  return nativeSignSession();
};

let resolveNativeSession: NativeSessionResolver = defaultNativeSessionResolver;

/** Test-only override. Pass `null` to restore the real resolver. */
export function __setNativeSignSessionResolverForTesting(
  resolver: NativeSessionResolver | null
): void {
  resolveNativeSession = resolver ?? defaultNativeSessionResolver;
}

async function nativeSessionOrNull(): Promise<NativeSignSession | null> {
  try {
    return await resolveNativeSession();
  } catch {
    return null;
  }
}

function resetNativeSignSession(): void {
  void nativeSessionOrNull().then((session) => session?.reset());
}

async function osPrompt(
  promptMessage: string,
  options: { readonly shareWithNativeSession: boolean }
): Promise<AuthOutcome> {
  if (options.shareWithNativeSession) {
    const session = await nativeSessionOrNull();
    if (session) {
      const code = await session.prime(promptMessage).catch(() => 'unsupported');
      if (code !== 'unsupported') {
        return code === '' ? { success: true } : { success: false, error: code };
      }
    }
  }
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage,
    fallbackLabel: 'Use device passcode',
    disableDeviceFallback: false,
    cancelLabel: 'Cancel',
  });
  if (r.success) return { success: true };
  // r.error is set to e.g. 'user_cancel', 'lockout', 'not_enrolled' on newer SDKs.
  const error =
    (r as unknown as { error?: string }).error ??
    (r as unknown as { warning?: string }).warning;
  return { success: false, error };
}
