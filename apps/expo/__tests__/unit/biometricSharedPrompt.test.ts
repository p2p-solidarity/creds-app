/**
 * One live prompt per user intent, across both gates and the native sign
 * session (2026-10-30 Face ID prompt reduction).
 *
 * Failure modes pinned here (each one is a real way to show too many — or too
 * few — Face ID sheets):
 *   1. Two access-level gates racing (`requireSensitiveAction` + `requireBiometric`)
 *      stack two OS sheets for one moment of presence.
 *   2. A red-line action rides an access-level sheet already on screen and so
 *      never gets its own live prompt.
 *   3. A legacy native-ACL key: the JS prompt does not prime the native sign
 *      context, so the keychain asks again inside the sign.
 *   4. A red-line prompt primes the native context (arming signatures the user
 *      never authorized for signing).
 *   5. "Ask every time" / a grace reset leaves the native context armed.
 *   6. A failed native prompt arms the grace or loses its failure type.
 *   7. A platform that cannot share the context ('unsupported') loses the gate.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';

const kv = new Map<string, string>();
const authCalls: string[] = [];
let nextAuth: Promise<{ success: boolean; error?: string }> | null = null;

interface FakeSession {
  primes: string[];
  resets: number;
  nextPrime: string | Promise<string>;
}

const session: FakeSession = { primes: [], resets: 0, nextPrime: '' };
let sessionAvailable = false;

type GateResult =
  | { readonly success: true; readonly method: 'biometric' | 'passcode' }
  | { readonly success: false; readonly reason: string };

interface BioMod {
  readonly requireBiometric: (reason: string) => Promise<boolean>;
  readonly resetBiometricGrace: () => void;
  readonly hasBiometricGrace: () => boolean;
  readonly __setNativeSignSessionResolverForTesting: (
    resolver: (() => Promise<unknown>) | null
  ) => void;
}

let bio: BioMod;
let requireSensitiveAction: (action: string, reason: string) => Promise<GateResult>;
let setMode: (mode: 'everyTime' | 'balanced' | 'redLineOnly') => void;
let resetPolicy: () => void;

beforeAll(async () => {
  await mock.module('@/storage/mmkv', () => ({
    getMmkv: () => ({
      getString: (k: string) => kv.get(k),
      set: (k: string, v: string) => void kv.set(k, String(v)),
      remove: (k: string) => kv.delete(k),
      getAllKeys: () => [...kv.keys()],
    }),
    initMmkv: () => Promise.resolve(undefined),
  }));
  await mock.module('expo-local-authentication', () => ({
    hasHardwareAsync: () => Promise.resolve(true),
    isEnrolledAsync: () => Promise.resolve(true),
    authenticateAsync: (opts: { promptMessage: string }) => {
      authCalls.push(opts.promptMessage);
      return nextAuth ?? Promise.resolve({ success: true });
    },
  }));
  bio = (await import('../../src/keychain/biometric')) as unknown as BioMod;
  ({ requireSensitiveAction } = (await import(
    '../../src/keychain/biometricGatekeeper'
  )) as unknown as { requireSensitiveAction: typeof requireSensitiveAction });
  const policy = await import('../../src/keychain/sensitiveActionPolicy');
  setMode = (mode) => policy.useSensitiveActionPolicy.getState().setMode(mode);
  resetPolicy = policy.resetSensitiveActionPolicyForTesting;
  bio.__setNativeSignSessionResolverForTesting(async () =>
    sessionAvailable
      ? {
          prime: (message: string) => {
            session.primes.push(message);
            return Promise.resolve(session.nextPrime);
          },
          reset: () => {
            session.resets += 1;
          },
        }
      : null
  );
});

afterAll(() => {
  bio.__setNativeSignSessionResolverForTesting(null);
});

beforeEach(() => {
  kv.clear();
  authCalls.length = 0;
  nextAuth = null;
  sessionAvailable = false;
  session.primes = [];
  session.nextPrime = '';
  resetPolicy();
  bio.resetBiometricGrace();
  session.resets = 0;
});

function deferredAuth(): (value: { success: boolean }) => void {
  let resolve!: (value: { success: boolean }) => void;
  nextAuth = new Promise((r) => {
    resolve = r;
  });
  return resolve;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('one OS sheet across both gates', () => {
  it('concurrent access-level gates from the two gate APIs share one sheet', async () => {
    const resolve = deferredAuth();
    const save = requireSensitiveAction('presentProof', 'sign the Page');
    const unlock = bio.requireBiometric('sign');
    await flush();
    expect(authCalls).toHaveLength(1);
    resolve({ success: true });
    expect((await save).success).toBe(true);
    expect(await unlock).toBe(true);
  });

  it('a red-line action never joins an access-level sheet already on screen', async () => {
    const resolve = deferredAuth();
    const sign = requireSensitiveAction('presentProof', 'sign');
    const reveal = requireSensitiveAction('revealRecoveryBundle', 'reveal phrase');
    await flush();
    expect([...authCalls].sort()).toEqual(['reveal phrase', 'sign']);
    resolve({ success: true });
    await Promise.all([sign, reveal]);
  });

  it('a sheet already on screen when the grace is reset does not re-open the window', async () => {
    const resolve = deferredAuth();
    const stale = requireSensitiveAction('presentProof', 'older intent');
    await flush();
    bio.resetBiometricGrace();
    resolve({ success: true });
    expect((await stale).success).toBe(true);
    expect(bio.hasBiometricGrace()).toBe(false);
  });

  it('everyTime still asks once per sequential intent (coalescing is not a window)', async () => {
    setMode('everyTime');
    await requireSensitiveAction('presentProof', 'one');
    await requireSensitiveAction('presentProof', 'two');
    expect(authCalls).toEqual(['one', 'two']);
  });
});

describe('legacy native-ACL key: one prompt arms both windows', () => {
  it('the graced prompt runs on the native sign context, not a second expo sheet', async () => {
    sessionAvailable = true;
    const gate = await requireSensitiveAction('issueCredential', 'save passport');
    expect(gate.success).toBe(true);
    expect(session.primes).toEqual(['save passport']);
    expect(authCalls).toEqual([]);
    expect(bio.hasBiometricGrace()).toBe(true);
  });

  it('a red-line prompt does NOT prime the native context', async () => {
    sessionAvailable = true;
    await requireSensitiveAction('rotateMasterKey', 'delete keys');
    expect(session.primes).toEqual([]);
    expect(authCalls).toEqual(['delete keys']);
  });

  it('resetting the grace and choosing everyTime both drop the native context', async () => {
    sessionAvailable = true;
    bio.resetBiometricGrace();
    setMode('everyTime');
    await flush();
    expect(session.resets).toBe(2);
  });

  it('a failed native prompt keeps its type and opens no window', async () => {
    sessionAvailable = true;
    session.nextPrime = 'lockout';
    const gate = await requireSensitiveAction('presentProof', 'sign');
    expect(gate).toEqual({ success: false, reason: 'lockedOut' });
    expect(bio.hasBiometricGrace()).toBe(false);
  });

  it("'unsupported' falls back to the expo prompt instead of dropping the gate", async () => {
    sessionAvailable = true;
    session.nextPrime = 'unsupported';
    nextAuth = Promise.resolve({ success: false, error: 'user_cancel' });
    const gate = await requireSensitiveAction('presentProof', 'sign');
    expect(authCalls).toEqual(['sign']);
    expect(gate).toEqual({ success: false, reason: 'cancelled' });
  });
});
