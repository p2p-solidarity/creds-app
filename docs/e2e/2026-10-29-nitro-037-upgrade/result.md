# Nitro 0.37 upgrade — 2026-10-29

Why: the onboarding 稍後再說 → 「無法完成身分設定」 (`storageFailed`, ~1 in 5 fresh installs) was a
data race in `react-native-nitro-modules` 0.35.7's unlocked Swift `Promise`
(`docs/e2e/2026-10-29-p1-maestro/result.md`). Upstream fixed it in 0.35.9 (#1338); this moves the
whole Nitro family to current.

| package | before | after |
|---|---|---|
| react-native-nitro-modules (+ nitrogen for attest/keystone) | 0.35.7 | 0.37.1 |
| react-native-vision-camera / -resizer / -worklets | 5.0.10 | 5.2.4 |
| react-native-nitro-image | 0.14.0 | 0.15.2 |
| react-native-mmkv | 4.3.1 | 4.3.2 |

`react-native-worklets` stays 0.10.1 (Expo SDK 57 pin). Every dependent declares the Nitro peer as `*`.

## What else had to move
- nitrogen 0.37.1 regenerated attest + keystone: Android only, `@FastNative` placement and comment
  typos; iOS generated code unchanged.
- Resizer 5.2 changed `ResizerKernels.metal` (`stretch` scale mode) → rebuilt
  `native-assets/VisionCameraResizer/default.metallib` and re-pinned both SHAs in
  `withPrecompiledVisionCameraResizerMetal`. (`metal` only runs outside the Bash sandbox here —
  the toolchain lives in a cryptex mount.)
- attest's `androidx.camera:camera-core` pin follows vision-camera's `camerax_version` → 1.7.0-alpha03.
- `test-setup.ts`'s `NitroModulesProxy` stub now reports the installed Nitro version (Nitro refuses
  to load on a native/JS version mismatch, which failed 50 tests).

## Bugs fixed on the way
- **Android build broken since 22b66290 (10/28 splash)**: `expo-splash-screen` 57.0.9 always writes
  `windowSplashScreenAnimatedIcon → @drawable/splashscreen_logo` but only generates the drawable when
  an `image` is set. Android now gets a 1×1 transparent image (`assets/splash-android-transparent.png`):
  plain background like iOS, then the JS LaunchSplash; no launcher-icon fallback.
- **PasskeyStep double run**: the `if (working) return` guard read render-time state, so a second tap
  before the re-render could start a second identity setup (two fresh mnemonics on a new install).
  Now a ref.
- **Error reports lost the native cause**: `throw new Error(kind)` kept only `storageFailed`. Storage
  failures now carry the native message; phrase-validation text is still dropped (the report is emailed).
- `iosBuildEnv` fixtures: d699ff6c pinned the CredsZktls zip SHA, which the curl stub cannot serve;
  the two fixtures now clear it like the other pins (prover staging is not covered by those tests).

## Real runs
- **iOS** (iPhone 17 sim, iOS 27, Debug dev client, Maestro flow 01 probe-free, 30 runs):
  27/27 valid runs reached the Links step, 0 `storageFailed`; 3 Maestro driver-startup timeouts
  while the Android build loaded the machine. Before the upgrade: 11 failures in 57 valid runs.
  `ios-onboarding-links-step.png`.
- **Android** (`assembleDebug`, arm64, Pixel 3a API 34 emulator): builds (attest Kotlin + CMake
  against vision-camera 5.2.4), launches, all 21 HybridObjects register, no FATAL / signal.
  `android-launch.png` (the emulator holds data from an old 1.3.1 install, hence "Continue Setup").
- `bun run typecheck && bun run lint && bun run test`: 0 errors, 1590 unit + 78 parity pass.

## Not verified
- No camera: the simulator has none and no device was attached, so the MRZ scanner (vision-camera
  frame output + attest `MrzOcr` downcast) and the resizer metallib were compiled but not exercised.
- Release archive / Xcode Cloud not run; Android release (AAB) not built.
- Seen on the emulator, not investigated: `[storageManager] skipping corrupt record
  contacts:leave-cards:v1:` / `contacts:recent-updates:v1:` (invalid base64) from the 1.3.1 data.
