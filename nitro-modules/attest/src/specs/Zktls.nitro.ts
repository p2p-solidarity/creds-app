/**
 * Nitro spec — zktls
 *
 * The on-device TLSNotary prover (docs/ref/10 §2 step ③): proves "this public
 * profile page, fetched over TLS, contains this field" through the creds.id
 * notary, revealing only that field. Rust in `zktls/` (C ABI, JSON in/out);
 * the caller passes the NIP-98 header it already signed — no key crosses here.
 *
 * iOS  : HybridZktls.swift -> CredsZktls.xcframework (zktls/build-ios.sh).
 *        A build without the xcframework compiles the stub path and reports
 *        `isAvailable = false`.
 * Android: not built yet — the object is not registered, so
 *        `getZktls()` returns null there.
 */
import type { HybridObject } from 'react-native-nitro-modules';

export interface Zktls extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /** False when this build was compiled without the prover library. */
  readonly isAvailable: boolean;
  /**
   * Request: `{ notaryUrl, authorization, host, path, fieldStart, fieldStop }`.
   * Result: `{ ok: true, value: { status, responseBytes, revealedBytes, ms } }`
   * or `{ ok: false, error: 'notary' | 'status' | 'fieldMissing' | 'failed' | 'unavailable', detail }`.
   * Never rejects for a proof failure — only for a bridge fault.
   */
  prove(requestJson: string): Promise<string>;
}
