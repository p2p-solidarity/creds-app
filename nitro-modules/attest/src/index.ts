/**
 * @solidarity/nitro-attest — public entrypoint.
 *
 * The attestation lifecycle, merged from the former nitro-mrz-ocr,
 * nitro-nfc-passport, nitro-passport-zk and nitro-semaphore packages
 * (2.0.0 nitro convergence):
 *
 *   - MrzOcr — passport MRZ capture. iOS: VNRecognizeTextRequest.
 *     Android: ML Kit Text Recognition.
 *   - NfcPassport — ePassport NFC read. iOS: NFCPassportReader wrap.
 *     Android: jmrtd.
 *   - PassportZk — Noir ZK prove + verify (mopro / barretenberg).
 *   - Semaphore — group membership proofs (semaphore-rs via uniffi).
 *   - DeviceAttest — App Attest / Android Key Attestation device keys.
 *
 * After `bunx nitrogen` + `pod install`, the generated HybridObject
 * adapters are auto-registered; each getter lazily creates its singleton so
 * importing the package doesn't crash where the native module isn't linked
 * (web preview, bun tests without the JSI bridge).
 */
import { NitroModules } from 'react-native-nitro-modules';

import type { DeviceAttest } from './specs/DeviceAttest.nitro';
import type { MrzOcr } from './specs/MrzOcr.nitro';
import type { NfcPassport } from './specs/NfcPassport.nitro';
import type { PassportZk } from './specs/PassportZk.nitro';
import type { Semaphore } from './specs/Semaphore.nitro';

export type {
  MrzOcr,
  MrzScanResult,
  PassportMrzDraft,
} from './specs/MrzOcr.nitro';

export type {
  NfcPassport,
  PassportMRZ,
  PassportReadResult,
  ParsedMrz,
  DataGroupsBundle,
} from './specs/NfcPassport.nitro';

export type {
  PassportZk,
  NitroNoirProof,
  OpenAcV3WitnessBuildResult,
} from './specs/PassportZk.nitro';

export type {
  Semaphore,
  SemaphoreProof,
} from './specs/Semaphore.nitro';

export type { DeviceAttest } from './specs/DeviceAttest.nitro';

let cachedMrzOcr: MrzOcr | null = null;

export function getMrzOcr(): MrzOcr {
  if (cachedMrzOcr) return cachedMrzOcr;
  cachedMrzOcr = NitroModules.createHybridObject<MrzOcr>('MrzOcr');
  return cachedMrzOcr;
}

let cachedNfcPassport: NfcPassport | null = null;

export function getNfcPassport(): NfcPassport {
  if (cachedNfcPassport) return cachedNfcPassport;
  cachedNfcPassport = NitroModules.createHybridObject<NfcPassport>('NfcPassport');
  return cachedNfcPassport;
}

let cachedPassportZk: PassportZk | null = null;

export function getPassportZk(): PassportZk {
  if (cachedPassportZk) return cachedPassportZk;
  cachedPassportZk = NitroModules.createHybridObject<PassportZk>('PassportZk');
  return cachedPassportZk;
}

let cachedSemaphore: Semaphore | null = null;

export function getSemaphore(): Semaphore {
  if (cachedSemaphore) return cachedSemaphore;
  cachedSemaphore = NitroModules.createHybridObject<Semaphore>('Semaphore');
  return cachedSemaphore;
}

let cachedDeviceAttest: DeviceAttest | null | undefined;

/** Hardware device keys, or null where the native module is not linked (web, bun tests). */
export function getDeviceAttest(): DeviceAttest | null {
  if (cachedDeviceAttest !== undefined) return cachedDeviceAttest;
  try {
    cachedDeviceAttest = NitroModules.createHybridObject<DeviceAttest>('DeviceAttest');
  } catch {
    cachedDeviceAttest = null;
  }
  return cachedDeviceAttest;
}
