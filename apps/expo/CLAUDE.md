# `apps/expo` — creds.id app (Expo)

The phone half of creds.id: an own-your-key link page (Page), verified badges,
People and Verify, on iOS and Android via Expo + Nitro Modules. The look
follows the creds.id web app (`../airmeishi-web`).

## Quick start

```bash
bun install                                                  # workspace root
cd apps/expo
bunx expo prebuild --clean --platform ios --no-install
bun run ios                                                  # launches simulator
bun run typecheck                                            # 0 errors expected
bun run test                                                 # unit + parity
bun run lint                                                 # 0 errors (cosmetic warnings ok)
```

### Dev client required — Expo Go cannot run this app

The Nitro modules (`nitro-attest`, `nitro-keystone`) are not in Expo Go. Build a
dev client once per native dependency change (`bunx expo prebuild --clean` +
`bun run ios` / `bun run android`), then `expo start` for the JS loop.

Android `minSdkVersion` is 29 and has shipped — don't lower it.

## UI rules

### Rule 1. Buttons → `ThemedButton` only
- `src/components/themed/ThemedButton.tsx` is the **only** primitive for
  CTAs. Variants: `primary | inverted | secondary | dottedOutline |
  destructive`.
- Never roll a per-screen `PrimaryButton`. Extend variants if you need
  more.
- `fullWidth` uses `alignSelf: 'stretch'` (never `flex: 1`).
- Foreground colour computed via `readableTextOn(accent)` so light
  accents stay legible (`components/themed/contrast.ts`).

### Rule 2. Text → `ThemedText`
- `src/components/themed/ThemedText.tsx`. Variants: `headlineLarge,
  headlineMedium, titleLarge, titleMedium, bodyLarge, bodyMedium,
  bodySmall, caption, label`.
- Never inline `fontSize: 17, fontWeight: '600'`.

### Rule 3. Surfaces → `ThemedSurface`
- Variants: `card | elevated | outlined | inset`. Use them for any
  card / sheet / muted bg instead of writing custom borderRadius +
  borderColor + backgroundColor blocks.

### Rule 4. Colours from `Colors` token, never inline hex
- `src/constants/Colors.ts` is the **single source** for brand hex.
- NativeWind classes (`bg-pageBg`, `text-text1`, `bg-accentRose`) read
  from `tailwind.config.js` which references `Colors`.
- Hex literals are allowed **only** in `Colors.ts` and `contrast.ts`
  (`ON_DARK` / `ON_LIGHT`).

### Rule 5. Theme mode + contrast knobs
- `global.css` exposes CSS vars per light/dark `@media`. NativeWind
  picks the right one automatically. Don't bypass with hardcoded hex.

### Rule 6. Touch targets ≥ 44 × 44
- `ThemedButton size="md"` already meets this. Custom hit areas: use
  44 explicitly.

### Rule 7. Haptics built into ThemedButton
- `ThemedButton` calls `haptic()` per default table
  (primary→success, destructive→warning, others→tap).
- Override with `haptic="…"` or `haptic={false}`.
- Direct usage: `import { haptic } from '@/feedback/haptics'`.

### Rule 8. No fake data
- Three valid states for any data-driven UI: `loading | ready | error`.
- Mock data only behind `usePreferences((s) => s.developerMode)` flag.

### Rule 9. State ownership
- High-frequency state (gestures, animations) → `SharedValue` via
  Reanimated 4.
- Persisted preferences → `usePreferences` zustand store (one place).
- Local UI state (selected variant, expanded section) → `useState` in
  the smallest component that renders the control.

### Rule 10. Navigation feel — never await on first paint
- All zustand stores seed in-memory `DEFAULTS` and hydrate on `useEffect`,
  so cache hits paint frame 1 without a skeleton.
- List → detail pages pass `{ id, name }` via `router.push({pathname,
  params})` so the detail hero is on screen before MMKV resolves.

## Repo layout (this app)

- `app/` — Expo Router routes; thin orchestrators (params, store hooks, layout).
- `src/<domain>/` — logic and stores per domain (`profile`, `people`, `nostr`,
  `witness`, `passport`, `keychain`, `identity`, `backup`, …).
- `src/components/<domain>/` — UI; `src/components/themed/` holds the primitives.
- `src/constants/Colors.ts` (palette), `src/constants/radius.ts` (radius/shadow roles).
- `__tests__/{unit,parity,ledger}/`.

New code that touches files still on `expo-file-system/legacy` may keep that
import; new files use the class API (`Paths` / `File` / `Directory`).

## CI

iOS releases ship via **Xcode Cloud** (Apple Developer 25 h/month free,
auto cert mgmt). The `withXcodeCloudScripts` config plugin
(`apps/expo/plugins/`) re-creates `ios/ci_scripts/ci_post_clone.sh`
after every `expo prebuild --clean` from the persistent source at
`ci-scripts/ci_post_clone.sh`. `withExpoModulesJsiPatches` rewrites `scripts/build-xcframework.sh` of the
installed `expo-modules-jsi` (58.0.21) at prebuild so Xcode 27 can archive it:
it wraps the nested `xcodebuild -quiet` whose spurious "error: … exited with
code 0" line otherwise fails the phase with "Command PhaseScriptExecution
emitted errors but did not return a nonzero exit code" (archive-only; plain
build tolerates it). The patch is anchor-checked and idempotent; drop it once
upstream stops emitting `error:` lines from that phase. `expo install --check`
must stay clean; `react-native-get-random-values` 2.0.0 is deliberately kept
via `expo.install.exclude` (Expo's table pins 1.11). The pod caches its xcframework in
`node_modules/expo-modules-jsi/apple/{Products,.DerivedData}` — a local
"BUILD SUCCEEDED" proves nothing about its Swift unless those are cleared first.
Never add a `ci_pre_xcodebuild.sh` that runs `xcodebuild -downloadComponent
metalToolchain`: on Xcode Cloud it exits 70 ("Failed fetching catalog for assetType").

Android release AABs build locally with `bun run build:android:local`
(prebuild + `./gradlew bundleRelease`, signing from `secrets/`).

## Error handling & crash diagnostics

Read this before debugging any crash. The usual failure is an exception
escaping opaquely (`abort() called`, no type).

### Where crashes are caught — and where they are NOT

| Crash class | Caught by | Result |
|---|---|---|
| JS **render** throw in any screen | `RootErrorBoundary` (Expo Router `ErrorBoundary`, re-exported from `app/_layout.tsx`) | Themed error screen + Retry, never a white screen |
| Uncaught JS error off the render path (timers, events, un-awaited rejects) | global `ErrorUtils` handler (installed by `src/feedback/RootErrorBoundary.tsx`) | Logged `[solidarity:uncaught]`, chained to default |
| **Native** uncaught exception — a TurboModule raising an NSException on its queue, a worklet throwing out of VisionCamera's async-runner, a C++ `abort` | **nothing — it terminates the process** | …but it NAMES ITSELF (see below). Fix at the call site. |

JS error boundaries CANNOT catch native crashes (e.g. a TurboModule
NSException from `ObjCTurboModule::performVoidMethodInvocation`); read the crash
report and guard the call site (don't mount a native view whose module is
unavailable).

### Self-identifying crashes — `MrzInstallCrashDiagnostics`

`nitro-modules/attest/ios/MrzVisionGuard.mm` installs a process-wide
`std::set_terminate` handler **at app launch** (`+load` → `dispatch_async(main)`
so it wraps RN/Hermes' handlers). On any uncaught exception it writes the
demangled type + message into:
- the crash report's **Application Specific Information** (`CRSetCrashLogMessage`,
  via `dlsym` — so it lands in the `.ips` you pull WITHOUT sudo), and
- an `os_log` fault tagged `[MRZ-FATAL]`.

A `facebook::jsi::JSError`'s message carries the **JS stack**, so a worklet/JS
crash names the exact function. Without this you get only `abort() called`.

### Pulling a device crash report (the A12 test phone)

Crashes live ON the device (`~/Library/Logs/DiagnosticReports` on the Mac only
has the Mac's own). Repro device = iPhone XR / A12 (`idevice_id -l`).

```bash
idevicecrashreport -u <UDID> -k /tmp/xr-crashes   # -k keeps them on device
# newest Solidarity-*.ips → read the header `asi` (now names the exception) +
# the faulting thread's queue/stack.
```

Need the full unified log (Espresso/ANE lines, the raw libc++abi message)?
`log collect` needs root — run it yourself with `! sudo …`, then `log show` the
archive with an ABSOLUTE PATH (a `log` shell function shadows `/usr/bin/log`):

```bash
! sudo log collect --device-udid <UDID> --last 20m --output /tmp/dev.logarchive
/usr/bin/log show /tmp/dev.logarchive --predicate 'process == "Solidarity"' --info --debug
```

### Worklet rules (VisionCamera frame processors / async-runner)

The OCR worklet runs on VisionCamera's **async-runner runtime** — NOT the
Reanimated UI runtime — which has NONE of react-native-worklets' JS-scheduling
globals. On that runtime:

- ❌ `scheduleOnRN(...)` and `console.log(...)` **throw** (`Object is not a
  function`; `console.log` routes through `scheduleOnRN`). A throw out of
  `runAsync` unwinds past Nitro and `std::terminate`s the whole app.
- ✅ A worklet must be **incapable of escaping**: body in try/catch/finally where
  the catch and finally only write SharedValues or swallow — never call anything
  that can throw (guard `frame.dispose()` too).
- ✅ Hand results back to JS via **SharedValues** (the one channel shared across
  runtimes), drained by a JS-thread poll. See `MRZCameraStep.tsx`
  (`acceptSeq`/`errorSeq` channel + 100 ms drain). `scheduleOnRN` IS fine on the
  UI runtime (gestures/animations, e.g. `SlideUpSheet.tsx`) — the ban is
  async-runner only.

### Native (Nitro / Vision) rules

- A Nitro HybridObject method must NOT throw per-frame for a transient failure —
  return an empty/no-op result and let the caller skip. Re-throwing across the
  Nitro/worklet boundary every frame is a terminate risk.
- Apple Vision `.accurate` on the A12 ANE raises an uncaught **C++** exception
  (Espresso), NOT an NSException, mid-inference. Catch it in ObjC++ with
  `catch (...)`, not only `@catch (NSException *)`. See `MrzPerformVisionRequest`.
- A Nitro `ArrayBuffer` **argument from JS is non-owning** — its backing store is
  valid ONLY for the synchronous duration of the call. NEVER touch
  `buffer.data` / `buffer.size` inside `Promise.async` (that body runs later, on
  the Swift-concurrency cooperative pool): the buffer is gone, Nitro raises an
  Objective-C exception → `EXC_BREAKPOINT` / SIGTRAP — an **uncatchable native
  crash**. No JS `try/catch`, `RootErrorBoundary`, or `Result` can stop it, so it
  reads as a silent 閃退 with "no error". **Copy to an owning `Data` BEFORE
  `return Promise.async {` and capture the `Data`**, e.g.
  `let bytes = copyPayload(payload); return Promise.async { … use bytes … }`.
  Buffers you create yourself via `ArrayBuffer.copy(data:)` are owning → exempt.
  When auditing a new
  HybridObject method: any `: ArrayBuffer` param read inside `Promise.async` is
  this bug.
