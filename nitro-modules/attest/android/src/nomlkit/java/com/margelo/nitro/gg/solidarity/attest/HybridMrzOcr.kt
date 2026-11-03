/*
 * HybridMrzOcr.kt — F-Droid build (no ML Kit)
 * @solidarity/nitro-attest (Android)
 *
 * The F-Droid flavor links no ML Kit (non-free), so there is no on-device
 * text recogniser. The class still exists because Nitro autolinking
 * registers it by name; the app hides the passport flow in this build
 * (`src/platform/distribution.ts`), so `scanFrame` is never reached.
 * The ML Kit implementation lives in `src/mlkit/`.
 */
package com.margelo.nitro.gg.solidarity.attest

import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip

@Keep
@DoNotStrip
class HybridMrzOcr : HybridMrzOcrSpec() {
  override fun scanFrame(frame: com.margelo.nitro.camera.HybridFrameSpec): MrzScanResult {
    throw UnsupportedOperationException("MRZ OCR is not available in the F-Droid build (no ML Kit).")
  }
}
