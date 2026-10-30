# 2026-10-30 — integration of the five 10-30 branches into 2.0.0, quick E2E and pipeline check

`2.0.0` = SDK 58 (`a970135b`) + passport P0–P3/P2 + UI rebrand R1–R4 (P4/P5) + SSRF guard + Nostr progressive read
+ `/@name` native intent + Face ID `redLineOnly`, merged in `f1de59d5`…`5ffe5b49`, test fix `73353bd4`, lockfile
`47e28b36`.

## Conflicts and how they were resolved

- `CryptoCompilingOverlay.tsx` — deleted (passport P2 removed its last caller).
- `CLAUDE.md` — kept witness honesty and the full threat-model line from 2.0.0; passport honesty (L1/L2/L3) replaces
  the old ZK honesty rule.
- `cards/solidarityQrRuntime.ts` — deleted (P4 one card). The one card shows the Page URL or its already-signed
  fragment, so nothing signs when the QR opens. Face ID's `signOwnCardJwt` / `signOwnCardRaw` had no other caller
  and were removed with their parity test; "own QR never prompts" now holds by design.
- `keychain/signingKey.ts` — `signOpenAcDeviceBindingDigest` / `publicRawP256ForCurrentIdentity` stay deleted (P2).
- Tests: parity uses `signRawEs256` for the native-acl cases; the Face ID ledger's passport story drops the two retired
  device-binding signatures and Present QR signs nothing.

## Ran for real

- Repo verify on the merged tree: `bun run typecheck` 0 errors, `bun run lint` 0 errors (173 warnings, pre-existing),
  `bun run test` 1502 + 73 pass, 0 fail.
- `scripts/prepare-ios-workspace.sh` with `AIRMEISHI_IOS_PREBUILD_CLEAN=1` (the Xcode Cloud path): clean prebuild,
  pod install, SPM pins OK. It surfaced a stale `bun.lock` (shared 2.1.2 → 2.1.3) that `--frozen-lockfile` on Xcode
  Cloud would have rejected → fixed in `47e28b36`.
- Debug build on the iPhone 18 Pro simulator (iOS 27): 0 errors. First real compile of Face ID's Swift
  (`primeSignSession` / `resetSignSession`).
- Release `xcodebuild archive` (generic iOS, unsigned, `-skipPackagePluginValidation`): **ARCHIVE SUCCEEDED**. The first
  attempt failed only because the git-ignored `ios/.xcode.env.local` pointed at a removed Node (asdf 24.22.2); local
  file fixed, Xcode Cloud writes its own.
- Quick E2E on the simulator:
  - `01-welcome.png` — cold launch to onboarding, creds.id rings, no red box.
  - `02-handle-link-sheet.png` — `https://creds.id/@kidneyx` universal link opens the Verified Page sheet (signature
    valid, live handle binding verified, X link checked by this phone, witness count `0`). Closing it returns to the
    screen underneath — no "Unmatched Route" (the `+native-intent` fix).
  - `solidarity://@kidneyx` still shows Unmatched Route: not a supported link form (the parser maps only the
    `creds.id/@name` host form), so this is expected, not a regression.

## TestFlight build 206 crash: tapping 出示 / 聯絡人

- Device: iPhone XR (`iPhone11,8`), iOS 18.7.10, TestFlight build 206 (= `47e28b36`). Every tap on another tab
  aborted the app ~instantly. The `.ips` only showed `ObjCTurboModule::performVoidMethodInvocation` rethrowing on
  `com.meta.react.turbomodulemanager.queue`; RN re-wraps the exception, so the module was not named.
- The live device console (`idevicesyslog`, `device-crash-before-fix.log`) named it:
  `RCTFatalException: Unhandled JS Exception: TypeError: Cannot read property 'emit' of undefined` at `onPress`
  — `ExceptionsManager.reportException` is the void method.
- Cause: expo-router 58 hands a custom `tabBar` `{ state, descriptors, emitter, navigateToTab, insets }` — no
  `navigation`. `FloatingTabBar` still called `navigation.emit(...)`, and `(tabs)/_layout.tsx` spread the props
  through `as unknown as FloatingTabBarProps`, so typecheck never saw it. Only a tab *tap* reaches it; deep links
  (used in the first quick E2E) do not.
- Fix: `FloatingTabBar` uses `emitter` + `navigateToTab` (same as expo-router's own `BottomTabBar`), and the cast is
  gone, so the router's real prop type is checked. Removing the cast immediately surfaced one more mismatch
  (`tabBarLabel`, unused here) — proof the check now bites.
- Verified on the iPhone 18 Pro simulator (Debug, iOS 27) by tapping the tab bar: 頁面 → 出示 → 聯絡人 → 頁面, no red
  box, Metro clean (`03-tap-present-tab.png`, `04-tap-contacts-tab.png`). Not yet re-run on the iPhone XR.

Also fixed: on 聯絡人 the red 刪除 swipe action showed at rest. gesture-handler 3's `ReanimatedSwipeable` draws the
actions `absoluteFill` behind the row and the row was transparent; the row container now has `pageBg`
(`05-contacts-row-at-rest.png`). The swipe gesture itself was not re-tested — another session took over the
shared simulator.

## Android

- `build:android:local` from a clean worktree at `47e28b36` first failed `checkReleaseAarMetadata`: Expo SDK 58
  libraries need `compileSdk 37`, `app.json` pinned 36 (the SDK 58 upgrade was only verified on iOS). Fixed in
  `bec45bcb` (compileSdk 37 in `app.json` and both Nitro modules; targetSdk stays 36).
- With that, `app-release-vc23.aab` built (48 min under heavy host load) and is signed with the Play upload key
  (`keytool`: SHA1 `58:22:A1:34…6B:14`). It was not submitted: it predates the tab-bar fix.
- `.android-version-code` is git-ignored and lives only in the main checkout; a clean worktree needs it copied in.

## Not run

- Anything past onboarding on the simulator (needs a passkey): Page editing, add-link sheet, one-card QR, Present,
  People, passport scan, Face ID prompt counts in the app.
- Real device: App Attest witness, two-phone witnessing, real passport + device statement, Pear exchange.
- Xcode Cloud itself (runs after push), signed export, TestFlight install.

## Pipelines

| Pipeline | Trigger | State after this integration |
|---|---|---|
| iOS — Xcode Cloud → TestFlight | push to `2.0.0` (PR #20) | Local mirror passes: prepare (frozen lockfile), clean prebuild, pods, Release archive. Passport SRS / xcframework staging removed in P2 (`1f1689f1`), so no per-pin release asset is needed any more. |
| Android — `build:android:local` → Play internal | manual | See Android above. Builds and signs correctly after `bec45bcb`. |
| GitHub release (`.github/workflows/release.yml`) | PR from `1.x`/`2.x` merged into `main`, or manual | Not triggered by this push. |
| creds.id web — `bun run deploy` (Cloudflare Pages) | manual | airmeishi-web `main` has `b7b3299` (relay settle-once fix) and shared 2.1.3 vendored; not pushed or deployed. |
| Notary worker — `apps/notary` `wrangler deploy` | manual | No change in this integration. |
| `@solidarity/shared` | version bump + vendor into web | 2.1.3; web vendors `solidarity-shared-2.1.3.tgz`. |

## Seen, not from this change

- LogBox warnings: `ImageBackground is deprecated` (RN 0.88), multiple URI schemes, and
  `[storageManager] skipping corrupt record contacts:*` — all pre-existing (see `2026-10-30-sdk58`).
- Host load average 60–170 from other sessions; the simulator was slow to paint but the app did not crash.
