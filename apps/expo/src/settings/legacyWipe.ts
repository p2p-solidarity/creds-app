/**
 * Data written by retired subsystems — groups, group sharing policy, the
 * vault, the Semaphore identity + nullifier set, passport anchors and the
 * Shoutouts relay keys. Old installs may still hold it. Nothing reads it any
 * more: it is only ever deleted.
 */
import * as SecureStore from 'expo-secure-store';

import { getSecretsVault } from '@solidarity/nitro-keystone';

import {
  deletionFailed,
  deletionSucceeded,
  type LocalDeletionResult,
} from '@/storage/deletionResult';
import { getMmkv } from '@/storage/mmkv';
import { loadSemaphoreNative } from '@/zk/nativeBridge';

export const LEGACY_MMKV_PREFIXES = ['group:', 'member:', 'passport-anchor:'] as const;
export const LEGACY_MMKV_KEYS = ['manifest:groups:v1', 'gg.solidarity.sharing.v1'] as const;

const VAULT_ROOT_SECRET_ALIAS = 'gg.solidarity.vault.rootSecret.v1';
const VAULT_WRAPPING_KEY_ALIASES = [
  'gg.solidarity.vault.rootSecret.wrapping.v1',
  'gg.solidarity.vault.rootSecret.wrapping.v2',
] as const;
const SHOUTOUTS_KEY_ALIASES = ['gg.solidarity.sakura.enc.v1', 'gg.solidarity.sakura.sig.ed25519.v1'] as const;

/** The root secret was written with and without the biometric ACL; delete both. */
const VAULT_ROOT_SECRET_OPTIONS: readonly SecureStore.SecureStoreOptions[] = [
  {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    requireAuthentication: true,
  },
  { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY, requireAuthentication: false },
];

function deleteLegacyMmkvKeys(): void {
  const mmkv = getMmkv();
  for (const key of mmkv.getAllKeys()) {
    if (
      LEGACY_MMKV_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
      (LEGACY_MMKV_KEYS as readonly string[]).includes(key)
    ) {
      mmkv.remove(key);
    }
  }
}

/**
 * The Semaphore native module owns its keychain attributes (and the legacy
 * airmeishi alias), so only its own `deleteIdentity` removes them. It also
 * deletes the nullifier set. A missing module is a failure: the items may
 * still exist on the device.
 */
async function deleteSemaphoreIdentity(): Promise<void> {
  const native = await loadSemaphoreNative();
  if (!native) throw new Error('semaphore unavailable');
  await native.deleteIdentity();
}

/** Every target is attempted; any failure makes the whole result a failure. */
export async function legacyWipe(): Promise<LocalDeletionResult> {
  const operations: readonly (() => unknown)[] = [
    deleteLegacyMmkvKeys,
    ...VAULT_ROOT_SECRET_OPTIONS.map(
      (options) => () => SecureStore.deleteItemAsync(VAULT_ROOT_SECRET_ALIAS, options),
    ),
    ...VAULT_WRAPPING_KEY_ALIASES.map((alias) => () => getSecretsVault().deleteKey(alias)),
    ...SHOUTOUTS_KEY_ALIASES.map(
      (alias) => () =>
        SecureStore.deleteItemAsync(alias, { keychainAccessible: SecureStore.WHEN_UNLOCKED }),
    ),
    deleteSemaphoreIdentity,
  ];
  const results = await Promise.allSettled(
    operations.map((operation) => Promise.resolve().then(operation)),
  );
  return results.some((result) => result.status === 'rejected')
    ? deletionFailed()
    : deletionSucceeded();
}

const LEGACY_WIPE_DONE_KEY = 'legacyWipe:v1:done';

/**
 * Boot-time cleanup for an upgraded install. Runs until it succeeds once;
 * the marker lives in MMKV, so a full local wipe re-arms it (harmless: the
 * targets are already gone and deleting a missing item is a no-op).
 */
export async function runLegacyWipeOnce(): Promise<void> {
  try {
    if (getMmkv().getString(LEGACY_WIPE_DONE_KEY) === '1') return;
    const result = await legacyWipe();
    if (result.ok) getMmkv().set(LEGACY_WIPE_DONE_KEY, '1');
  } catch {
    // MMKV not ready — the next launch retries.
  }
}
