/**
 * Nitro spec — deviceattest
 *
 * Hardware device keys vouched for by Apple / Google (docs/ref/10 §3.11 tier
 * 3): the key lives in the Secure Enclave / TEE and the platform certifies it
 * belongs to an unmodified creds app on a real device. Verified offline by
 * `@solidarity/shared/deviceproof`.
 *
 * iOS    : DCAppAttestService — `createAttestedKey` = generateKey + attestKey;
 *          `sign` = generateAssertion over SHA-256(data). Not on simulators.
 * Android: AndroidKeyStore EC P-256 with `setAttestationChallenge`
 *          (StrongBox when present); `sign` = SHA256withECDSA.
 *
 * Bytes cross as base64 strings (no ArrayBuffer args). Results are JSON
 * `{ ok: true, value }` or `{ ok: false, error, detail }` with
 * error ∈ 'unsupported' | 'serverUnavailable' | 'invalidKey' | 'failed';
 * the promise only rejects for a bridge fault.
 */
import type { HybridObject } from 'react-native-nitro-modules';

export interface DeviceAttest extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /** False on simulators/emulators and devices without hardware attestation. */
  readonly isSupported: boolean;
  /**
   * New attested key. `alias` names the Android KeyStore entry (ignored on
   * iOS); `challengeB64` is what the attestation must bind (SHA-256 bytes).
   * value — iOS: `{ platform: 'ios', keyRef, keyId, attestation }`;
   * Android: `{ platform: 'android', keyRef, chain }`.
   */
  createAttestedKey(alias: string, challengeB64: string): Promise<string>;
  /** value: `{ signature }` — App Attest assertion (iOS) or DER ECDSA (Android), base64. */
  sign(keyRef: string, dataB64: string): Promise<string>;
}
