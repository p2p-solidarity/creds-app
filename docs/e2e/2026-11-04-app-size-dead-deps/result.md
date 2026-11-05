# 2026-11-04 — App size: drop dead dependencies

## Change

Removed from `apps/expo`: `react-native-webrtc`, `expo-notifications`, `expo-blur`,
`expo-screen-orientation`, `react-native-vision-camera-resizer` (plus its precompiled
metallib plugin, script and test), `@gorhom/bottom-sheet`, `expo-auth-session`.
None were imported or looked up by native-module name anywhere in the app,
packages or nitro modules. `expo-application` (imported by
`src/feedback/errorReport.ts`, previously only present transitively via
expo-notifications / expo-auth-session) is now a direct dependency.

## Sizes (measured)

| | before | after |
|---|---|---|
| Android arm64 download (bundletool `get-size total`, ABI) | 74.33 MB (vc31) | 68.35 MB |
| Android AAB | 298.3 MB (vc31) | 276.3 MB |
| iOS `.app` in Release archive | — (no current baseline; b36 from 2026-08 still had the 128 MB SRS) | 128 MB uncompressed, ~50 MB zipped Payload |

The iOS archive no longer contains `WebRTC.framework` (~10 MB in b36). The
Android AAB no longer contains `libjingle_peerconnection_so.so`, Firebase
Messaging, play-services-cloud-messaging, BlurView or ShortcutBadger.
Regenerated `licenses.json`: 34 rows removed, 0 added.

Biggest remaining items: `libbare-kit.so` (65 MB raw per Android ABI) /
`BareKit.framework` (33 MB), `libsemaphore_bindings.so` (20 MB), ML Kit OCR (11 MB).

## Runs

| Case | Verdict | Evidence |
|---|---|---|
| Android `bundleRelease` (prebuild + gradle, debug-template signing) | PASS | BUILD SUCCESSFUL |
| Android release APK cold start on the AVD (API 36, arm64), upgrade over existing install | PASS | logcat reaches `[solidarity:boot] show-app:boot-complete`; no FATAL / DSO / UnsatisfiedLink |
| iOS Release archive (generic/platform=iOS) | PASS | archive produced |
| iOS Release simulator build cold start, iPhone 18 Pro (iOS 27.2) | PASS | `ios-release-sim-launch.png` (onboarding page 1); no new crash report |
| `bun run typecheck && bun run lint && bun run test` | PASS | 0 TS errors, 0 lint errors, 1500 unit + 73 parity pass |

## Not run

- No flows beyond cold start (camera / MRZ scanner, QR scan, Pear exchange) on either platform.
- No real device. No upload to Play / App Store, so store-reported sizes are not checked.
- Android 16 KB page-size check not re-run (only removals, no new native libs).
- Android build was signed with the template debug key, not the release key.
