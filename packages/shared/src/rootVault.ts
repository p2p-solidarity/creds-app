import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { mnemonicToSeedSync, validateMnemonic as bip39ValidateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

import {
  aesGcmOpen,
  aesGcmSeal,
  base64UrlDecode,
  base64UrlEncode,
  bytesToUtf8,
  deriveKey,
  sha256Bytes,
  utf8ToBytes,
} from './crypto';
import {
  deriveP256Scalar,
  HKDF_INFO_ROOT,
} from './derive';
import { nostrPublicKeyHex } from './nostr/event';
import { err, ok, type Result } from './types/result';

export const ROOT_VAULT_VERSION = 1 as const;
export const ROOT_VAULT_KEY_INFO = 'solidarity-root-vault-key-v1';
export const ROOT_VAULT_PRF_CONTEXT = 'solidarity-root-vault-prf-v1';
export const ROOT_VAULT_OWNER_INFO = 'solidarity-root-vault-owner-v1';
export const ROOT_VAULT_META_INFO = 'solidarity-root-vault-meta-v1';

export interface RootVaultRecordV1 {
  readonly v: typeof ROOT_VAULT_VERSION;
  readonly ciphertext: string;
}

export interface OpenedRootVault {
  readonly mnemonic: string;
  /** Exact Nostr signing scalar when the app uses an imported nsec. */
  readonly nostrScalar?: Uint8Array;
}

export type RootVaultError =
  | { readonly kind: 'invalidCredential' }
  | { readonly kind: 'invalidPrfOutput' }
  | { readonly kind: 'invalidMnemonic' }
  | { readonly kind: 'invalidRecord' }
  | { readonly kind: 'decryptFailed' };

function validateMnemonic(mnemonic: string): boolean {
  try {
    const scalar = deriveP256Scalar(mnemonic, HKDF_INFO_ROOT);
    scalar.fill(0);
    return true;
  } catch {
    return false;
  }
}

function deriveVaultKey(
  credentialId: Uint8Array,
  prfOutput: Uint8Array
): Result<Uint8Array, RootVaultError> {
  if (credentialId.length === 0) return err({ kind: 'invalidCredential' });
  if (prfOutput.length !== 32) return err({ kind: 'invalidPrfOutput' });
  return ok(
    deriveKey(prfOutput, sha256Bytes(credentialId), ROOT_VAULT_KEY_INFO, 32)
  );
}

export function rootVaultPrfInput(): Uint8Array {
  return sha256Bytes(ROOT_VAULT_PRF_CONTEXT);
}

export function rootVaultLocator(credentialId: Uint8Array): string {
  if (credentialId.length === 0) {
    throw new RangeError('rootVaultLocator: credential ID must not be empty');
  }
  return base64UrlEncode(sha256Bytes(credentialId));
}

export function sealRootVault(
  mnemonic: string,
  credentialId: Uint8Array,
  prfOutput: Uint8Array,
  nonce?: Uint8Array,
  nostrScalar?: Uint8Array
): Result<RootVaultRecordV1, RootVaultError> {
  if (!validateMnemonic(mnemonic)) return err({ kind: 'invalidMnemonic' });
  if (nostrScalar !== undefined && !validateNostrScalar(nostrScalar)) {
    return err({ kind: 'invalidRecord' });
  }
  const keyResult = deriveVaultKey(credentialId, prfOutput);
  if (!keyResult.ok) return keyResult;

  const key = keyResult.value;
  try {
    const plaintext = utf8ToBytes(
      JSON.stringify({
        v: 1,
        mnemonic,
        ...(nostrScalar === undefined
          ? {}
          : { nostrKey: base64UrlEncode(nostrScalar) }),
      })
    );
    return ok({
      v: ROOT_VAULT_VERSION,
      ciphertext: base64UrlEncode(aesGcmSeal(key, plaintext, nonce)),
    });
  } finally {
    key.fill(0);
  }
}

export function openRootVault(
  record: unknown,
  credentialId: Uint8Array,
  prfOutput: Uint8Array
): Result<OpenedRootVault, RootVaultError> {
  if (!isRootVaultRecord(record)) return err({ kind: 'invalidRecord' });
  const keyResult = deriveVaultKey(credentialId, prfOutput);
  if (!keyResult.ok) return keyResult;

  const key = keyResult.value;
  try {
    const decoded = bytesToUtf8(
      aesGcmOpen(key, base64UrlDecode(record.ciphertext))
    );
    const payload: unknown = JSON.parse(decoded);
    if (!isRootVaultPayload(payload) || !validateMnemonic(payload.mnemonic)) {
      return err({ kind: 'invalidRecord' });
    }
    if (payload.nostrKey === undefined) {
      return ok({ mnemonic: payload.mnemonic });
    }
    const nostrScalar = base64UrlDecode(payload.nostrKey);
    if (!validateNostrScalar(nostrScalar)) {
      nostrScalar.fill(0);
      return err({ kind: 'invalidRecord' });
    }
    return ok({ mnemonic: payload.mnemonic, nostrScalar });
  } catch {
    return err({ kind: 'decryptFailed' });
  } finally {
    key.fill(0);
  }
}

function isRootVaultRecord(value: unknown): value is RootVaultRecordV1 {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    record['v'] === ROOT_VAULT_VERSION &&
    typeof record['ciphertext'] === 'string' &&
    record['ciphertext'].length > 0
  );
}

function isRootVaultPayload(
  value: unknown
): value is {
  readonly v: 1;
  readonly mnemonic: string;
  readonly nostrKey?: string;
} {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Record<string, unknown>;
  const keys = Object.keys(payload);
  const hasNostrKey = Object.prototype.hasOwnProperty.call(payload, 'nostrKey');
  return (
    keys.length === (hasNostrKey ? 3 : 2) &&
    keys.every((key) => key === 'v' || key === 'mnemonic' || key === 'nostrKey') &&
    payload['v'] === ROOT_VAULT_VERSION &&
    typeof payload['mnemonic'] === 'string' &&
    (!hasNostrKey || typeof payload['nostrKey'] === 'string')
  );
}

function validateNostrScalar(value: Uint8Array): boolean {
  if (value.length !== 32) return false;
  try {
    nostrPublicKeyHex(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Owner index — lets every device holding the root list, rename and delete
 * that identity's vault rows without the service learning the DID.
 *
 * Both values come from the mnemonic seed (same HKDF salt as `derive.ts`,
 * distinct info labels), so the app and the web reach the same rows. The
 * service stores only `rootVaultOwnerHash(ownerSecret)`; the secret travels
 * as a bearer token over HTTPS. Row metadata is AES-GCM sealed under
 * `metaKey` with the row's locator as AAD, so the service can neither read
 * device names nor move one row's metadata onto another.
 */
export interface RootVaultAccess {
  readonly ownerSecret: Uint8Array;
  readonly metaKey: Uint8Array;
}

export type RootVaultPlatform = 'ios' | 'android' | 'web';

export interface RootVaultMeta {
  readonly v: 1;
  readonly label: string;
  /** Raw WebAuthn credential ID, base64url — needed for the provider signal on delete. */
  readonly credentialId: string;
  readonly createdAt: string;
  readonly platform: RootVaultPlatform;
  readonly device: string;
  readonly aaguid: string | null;
}

const ACCESS_SALT = utf8ToBytes('solidarity');
const META_NONCE_LEN = 12;
const META_LABEL_MAX = 64;
const META_DEVICE_MAX = 64;
const META_CREDENTIAL_ID_MAX = 512;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const AAGUID_RE = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const META_KEYS = ['aaguid', 'createdAt', 'credentialId', 'device', 'label', 'platform', 'v'];

export function deriveRootVaultAccess(
  mnemonic: string
): Result<RootVaultAccess, RootVaultError> {
  if (!bip39ValidateMnemonic(mnemonic, wordlist)) {
    return err({ kind: 'invalidMnemonic' });
  }
  const seed = mnemonicToSeedSync(mnemonic);
  try {
    return ok({
      ownerSecret: deriveKey(seed, ACCESS_SALT, ROOT_VAULT_OWNER_INFO, 32),
      metaKey: deriveKey(seed, ACCESS_SALT, ROOT_VAULT_META_INFO, 32),
    });
  } finally {
    seed.fill(0);
  }
}

export function rootVaultOwnerHash(ownerSecret: Uint8Array): string {
  if (ownerSecret.length !== 32) {
    throw new RangeError('rootVaultOwnerHash: owner secret must be 32 bytes');
  }
  return base64UrlEncode(sha256Bytes(ownerSecret));
}

function isLengthBounded(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

export function isRootVaultMeta(value: unknown): value is RootVaultMeta {
  if (typeof value !== 'object' || value === null) return false;
  const meta = value as Record<string, unknown>;
  const keys = Object.keys(meta).sort();
  return (
    keys.length === META_KEYS.length &&
    keys.every((key, index) => key === META_KEYS[index]) &&
    meta['v'] === 1 &&
    isLengthBounded(meta['label'], META_LABEL_MAX) &&
    isLengthBounded(meta['credentialId'], META_CREDENTIAL_ID_MAX) &&
    BASE64URL_RE.test(meta['credentialId'] as string) &&
    typeof meta['createdAt'] === 'string' &&
    !Number.isNaN(Date.parse(meta['createdAt'])) &&
    (meta['platform'] === 'ios' || meta['platform'] === 'android' || meta['platform'] === 'web') &&
    isLengthBounded(meta['device'], META_DEVICE_MAX) &&
    (meta['aaguid'] === null ||
      (typeof meta['aaguid'] === 'string' && AAGUID_RE.test(meta['aaguid'])))
  );
}

export function sealRootVaultMeta(
  meta: RootVaultMeta,
  locator: string,
  metaKey: Uint8Array,
  nonce: Uint8Array = randomBytes(META_NONCE_LEN)
): Result<string, RootVaultError> {
  if (!isRootVaultMeta(meta)) return err({ kind: 'invalidRecord' });
  if (metaKey.length !== 32 || nonce.length !== META_NONCE_LEN) {
    return err({ kind: 'invalidRecord' });
  }
  const plaintext = utf8ToBytes(
    JSON.stringify({
      v: 1,
      label: meta.label,
      credentialId: meta.credentialId,
      createdAt: meta.createdAt,
      platform: meta.platform,
      device: meta.device,
      aaguid: meta.aaguid,
    })
  );
  const body = gcm(metaKey, nonce, utf8ToBytes(locator)).encrypt(plaintext);
  const combined = new Uint8Array(META_NONCE_LEN + body.length);
  combined.set(nonce, 0);
  combined.set(body, META_NONCE_LEN);
  return ok(base64UrlEncode(combined));
}

export function openRootVaultMeta(
  sealed: string,
  locator: string,
  metaKey: Uint8Array
): Result<RootVaultMeta, RootVaultError> {
  if (metaKey.length !== 32 || !BASE64URL_RE.test(sealed)) {
    return err({ kind: 'invalidRecord' });
  }
  let payload: unknown;
  try {
    const combined = base64UrlDecode(sealed);
    if (combined.length < META_NONCE_LEN + 16) return err({ kind: 'invalidRecord' });
    const plaintext = gcm(
      metaKey,
      combined.subarray(0, META_NONCE_LEN),
      utf8ToBytes(locator)
    ).decrypt(combined.subarray(META_NONCE_LEN));
    payload = JSON.parse(bytesToUtf8(plaintext));
  } catch {
    return err({ kind: 'decryptFailed' });
  }
  return isRootVaultMeta(payload) ? ok(payload) : err({ kind: 'invalidRecord' });
}
