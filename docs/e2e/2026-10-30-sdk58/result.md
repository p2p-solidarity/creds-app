# Expo SDK 57 → 58 upgrade — simulator run (2026-10-30)

expo 58.0.21 / RN 0.88.1 / React 19.3.0 / gesture-handler 3.3.0 / reanimated 4.7.1 / worklets 0.13.0 / expo-symbols 58.0.4.

## What ran

- `LANG=en_US.UTF-8 AIRMEISHI_IOS_PREBUILD_CLEAN=1 AIRMEISHI_RUN_BUN_INSTALL=0 apps/expo/scripts/prepare-ios-workspace.sh` (the CI prebuild path) — passes after re-anchoring `withExpoModulesJsiPatches` (expo-modules-jsi 58.0.21 still replays the nested xcodebuild output verbatim; patched script passes `bash -n`).
- `expo run:ios --scheme solidarity --no-bundler --no-install` Debug build on the existing `iPhone 18 Pro` (iOS 27.0) sim → Build Succeeded, installed, JS booted from Metro to `[solidarity:boot] show-app:boot-complete`. No `enableSceneSupport` in app.json any more; launch on iOS 27 is fine (SDK 58 has scene support built in).
- Onboarding Welcome → Username step (live `creds.id` availability check returned "可以使用").
- `solidarity://people` deep link → People tab rendered (wrapped in the new `useGestureAutoBackup` `usePanGesture` detector); a 320 pt downward pull ran without a crash or JS error (backup disabled on this sim, so it is a silent skip by design).
- `solidarity://me` → Me tab shows the onboarding gate card.

## Found and fixed during the run

`01-before-expo-symbols-fix.png`: every `SfIcon` rendered as a pink "U" placeholder, with `Unable to get the view config for default view from module SymbolModule`. Cause: the app imports `expo-symbols` but never declared it, so `expo install --fix` skipped it and the hoisted SDK 57 copy (57.0.3) stayed. Declared it via `expo install expo-symbols` (~58.0.4), pod install, rebuild → `03-username-symbols-ok.png` shows the chevron / check / info glyphs back.

## Screenshots

- `01-before-expo-symbols-fix.png` — the placeholder-icon regression
- `02-welcome.png` — first screen after the fixed build
- `03-username-symbols-ok.png` — Username step, SF Symbols render
- `04-people-after-pull.png` — People tab after the pull gesture
- `05-me-gate.png` — Me tab gate

## Not run

- `rowDrag` (Page link reorder, now `usePanGesture`) drag interaction: needs a finished onboarding with links, which needs a passkey; not reachable on this sim. Covered only by typecheck, lint and the worklet-artifact test (callbacks are workletized by the worklets plugin).
- Pull-to-backup with backup enabled (would need a Recovery Phrase + iCloud on the sim).
- Release archive (`xcodebuild … archive`) and Xcode Cloud; Android build (no AVD).
- Real device (App Attest / passkey / NFC paths).

## Seen, not from this change

- `ImageBackground is deprecated` warning (new in RN 0.88) — the yellow LogBox pill in the screenshots.
- `[storageManager] skipping corrupt record contacts:leave-cards:v1 / recent-updates:v1` — pre-existing (see the SDK 57 notes).
- First tap right after a cold boot was dropped twice while the sim was still busy; the second tap worked.
