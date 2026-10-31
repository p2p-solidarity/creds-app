/**
 * Native sign session — the bridge that lets ONE Face ID cover both graces.
 *
 * Two windows exist for the device signing key:
 *   - the JS grace bucket (`biometric.ts`, 5 min), used by every
 *     `requireSensitiveAction` / `requireBiometric` gate and the root signer;
 *   - the native `SignSession` LAContext (`HybridSpruceDid.swift`, 300 s),
 *     used only when the key itself carries a keychain ACL — the legacy
 *     Secure Enclave `.userPresence` key that pre-2026-06-13 installs kept.
 *
 * Before this bridge they never saw each other: a JS prompt did not arm the
 * native context, so a legacy key asked again inside the sign, and a native
 * prompt did not arm the JS bucket. Now, when the active key is native-ACL and
 * the binary exposes `primeSignSession`, the JS gate's live prompt runs ON the
 * native context (`prime`) — one sheet arms both windows at the same instant —
 * and every JS grace reset also resets the native context (`reset`), so
 * "ask every time" holds for legacy keys too.
 *
 * `null` (no bridge) whenever the key is js-gated, absent, the native binary
 * predates these methods, or anything fails: callers then keep the previous
 * behaviour (expo-local-authentication prompt; native ACL prompts by itself).
 *
 * Loaded lazily from `biometric.ts` so the gate stays importable in tests
 * without native modules; tests drive it through `__SPRUCE_DID_TEST_DRIVER__`,
 * the same override `signingKey.ts` honours.
 */
import type { SpruceDid } from '@solidarity/nitro-keystone';
import { Platform } from 'react-native';

/** The identity key alias — shared with `signingKey.ts`. */
export const SIGNING_KEY_ALIAS = 'solidarity.master.v2';

/**
 * 'native-acl' = the OS prompts inside the keychain / keystore sign itself.
 * Anything unresolvable is 'js-gated' — fail-safe: worst case is a double
 * prompt, never a missing gate.
 */
export type KeyAuthMode = 'native-acl' | 'js-gated';

export interface NativeSignSession {
  /**
   * Live prompt on a FRESH native sign context, armed on success. Resolves
   * '' on success, otherwise an expo-local-authentication-style error code
   * (`user_cancel`, `lockout`, …), or 'unsupported' when this platform cannot
   * share the context (Android per-use auth keys).
   */
  readonly prime: (promptMessage: string) => Promise<string>;
  /** Drop the native context so the next native-ACL sign re-authenticates. */
  readonly reset: () => void;
}

interface SessionCapableDriver {
  readonly primeSignSession?: (reason: string) => Promise<string>;
  readonly resetSignSession?: () => void;
  readonly keyAuthMode?: (alias: string) => Promise<string>;
}

let cachedAuthMode: KeyAuthMode | null = null;

async function driver(): Promise<SpruceDid | null> {
  const override = (globalThis as { __SPRUCE_DID_TEST_DRIVER__?: SpruceDid })
    .__SPRUCE_DID_TEST_DRIVER__;
  if (override) return override;
  try {
    const { getSpruceDid } = await import('@solidarity/nitro-keystone');
    return getSpruceDid();
  } catch {
    return null;
  }
}

function isIosRuntime(): boolean {
  const override = (globalThis as { __SPRUCE_DID_TEST_PLATFORM__?: string })
    .__SPRUCE_DID_TEST_PLATFORM__;
  if (override) return override === 'ios';
  // Static named import only: `await import('react-native')` makes Metro
  // importAll the barrel, which runs every lazy getter — RN 0.88's
  // PushNotificationIOS getter throws natively-null NativeEventEmitter, and
  // Metro reports a module-init throw as fatal before any catch runs.
  return Platform.OS === 'ios';
}

/** Resolved once per process from the native driver (a key's ACL is fixed). */
export async function resolveKeyAuthMode(d: SpruceDid, alias: string): Promise<KeyAuthMode> {
  if (cachedAuthMode) return cachedAuthMode;
  let mode: KeyAuthMode = 'js-gated';
  try {
    const probe = (d as SessionCapableDriver).keyAuthMode;
    if (typeof probe === 'function') {
      mode = (await probe.call(d, alias)) === 'native-acl' ? 'native-acl' : 'js-gated';
    }
  } catch {
    mode = 'js-gated';
  }
  cachedAuthMode = mode;
  return mode;
}

/** Forget the resolved mode — the key was deleted or replaced. */
export function forgetKeyAuthMode(): void {
  cachedAuthMode = null;
}

/** The bridge for the active key, or null when there is nothing to share. */
export async function nativeSignSession(): Promise<NativeSignSession | null> {
  try {
    const d = await driver();
    if (!d?.hasKey(SIGNING_KEY_ALIAS)) return null;
    if ((await resolveKeyAuthMode(d, SIGNING_KEY_ALIAS)) !== 'native-acl') return null;
    const { primeSignSession, resetSignSession } = d as SessionCapableDriver;
    if (typeof primeSignSession !== 'function' || typeof resetSignSession !== 'function') {
      return null;
    }
    // Android auth-bound keys need a per-signature BiometricPrompt
    // CryptoObject; no context can be shared, so they keep the native prompt.
    if (!isIosRuntime()) return null;
    return {
      prime: (promptMessage) => primeSignSession.call(d, promptMessage),
      reset: () => {
        try {
          resetSignSession.call(d);
        } catch {
          // A failed reset leaves at most the native 300 s window, which the
          // next JS prompt replaces with a fresh context anyway.
        }
      },
    };
  } catch {
    return null;
  }
}
