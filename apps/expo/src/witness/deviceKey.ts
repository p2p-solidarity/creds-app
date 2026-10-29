/**
 * This phone's attested device key (docs/ref/10 §3.11 tier 3), bound to the
 * user's npub through the attestation challenge. Created on first use (iOS
 * asks Apple once, ~1 s), kept in MMKV — the attestation is public (it rides
 * in every witness) and the private key never leaves the Secure Enclave /
 * TEE. A key whose attestation no longer verifies (Android RKP certificates
 * expire within days) is replaced by the caller via `dropDeviceKey`.
 */
import { getDeviceAttest } from '@solidarity/nitro-attest';
import { base64Encode, deviceKeyChallenge, err, ok, type DeviceProof, type Result } from '@solidarity/shared';

import { getMmkv } from '@/storage/mmkv';

const KEY = 'witness:devicekey:v1';

export type DeviceKeyFailure = 'unsupported' | 'serverUnavailable' | 'failed';

interface StoredDeviceKey {
  readonly npubHex: string;
  readonly platform: 'ios' | 'android';
  readonly keyRef: string;
  /** iOS: key id + attestation object (base64). */
  readonly keyId?: string;
  readonly attestation?: string;
  /** Android: certificate chain, leaf first (base64 DER). */
  readonly chain?: readonly string[];
}

type NativeResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

function parseNative<T>(json: string): NativeResult<T> {
  try {
    return JSON.parse(json) as NativeResult<T>;
  } catch {
    return { ok: false, error: 'failed' };
  }
}

function nativeFailure(error: string): DeviceKeyFailure {
  return error === 'unsupported' || error === 'serverUnavailable' ? error : 'failed';
}

function readStored(npubHex: string): StoredDeviceKey | null {
  try {
    const raw = getMmkv().getString(KEY);
    if (raw === undefined) return null;
    const stored = JSON.parse(raw) as StoredDeviceKey;
    return stored.npubHex === npubHex ? stored : null;
  } catch {
    return null;
  }
}

export function deviceAttestSupported(): boolean {
  return getDeviceAttest()?.isSupported === true;
}

export function dropDeviceKey(): void {
  try {
    getMmkv().remove(KEY);
  } catch {
    // MMKV not ready: nothing stored to drop.
  }
}

async function ensureDeviceKey(npubHex: string): Promise<Result<StoredDeviceKey, DeviceKeyFailure>> {
  const cached = readStored(npubHex);
  if (cached !== null) return ok(cached);
  const native = getDeviceAttest();
  if (!native?.isSupported) return err('unsupported');

  const challenge = base64Encode(deviceKeyChallenge(npubHex));
  const created = parseNative<{ platform: 'ios' | 'android'; keyRef: string; keyId?: string; attestation?: string; chain?: string[] }>(
    await native.createAttestedKey(`creds.devicekey.${npubHex.slice(0, 16)}`, challenge),
  );
  if (!created.ok) return err(nativeFailure(created.error));
  const stored: StoredDeviceKey = { npubHex, ...created.value };
  try {
    getMmkv().set(KEY, JSON.stringify(stored));
  } catch {
    // Not persisted: the next witness attests a fresh key.
  }
  return ok(stored);
}

/** Sign `statement` (the exact bytes a witness carries) with this phone's attested key. */
export async function signWithDeviceKey(npubHex: string, statement: string): Promise<Result<DeviceProof, DeviceKeyFailure>> {
  const key = await ensureDeviceKey(npubHex);
  if (!key.ok) return key;
  const native = getDeviceAttest();
  if (native === null) return err('unsupported');
  const signed = parseNative<{ signature: string }>(
    await native.sign(key.value.keyRef, base64Encode(new TextEncoder().encode(statement))),
  );
  if (!signed.ok) {
    // An invalidated key (app reinstall restores MMKV but not the enclave key) → start over.
    if (signed.error === 'invalidKey') dropDeviceKey();
    return err(nativeFailure(signed.error));
  }
  const k = key.value;
  if (k.platform === 'ios' && k.keyId !== undefined && k.attestation !== undefined) {
    return ok({ platform: 'ios', keyId: k.keyId, attestation: k.attestation, assertion: signed.value.signature });
  }
  if (k.platform === 'android' && k.chain !== undefined) {
    return ok({ platform: 'android', chain: k.chain, signature: signed.value.signature });
  }
  dropDeviceKey();
  return err('failed');
}

