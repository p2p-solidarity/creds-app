# P1 — test slimming + first Maestro flow — 2026-10-29

Plan: `docs/ref/10-plan-simplify-and-verify.md` §6, §7 P1.

## Test slimming

Included the cleanup staged on 2026-09-28 but never committed (57 surface / source-grep / copy tests),
then checked every §6 candidate by hand. Several were wrongly labelled "store glue" in the plan and are
kept because they pin security, privacy or money rules (`profileStore`, `pageDesignStore`,
`proEntitlementStore`, `issuerStore`, `oidcParse`, `iosBuildEnv`, …); the plan now records the real list.

| | before | after |
|---|---|---|
| unit test files | 162 | 154 |
| unit tests | 1667 | 1590 |
| unit runtime (`bun run test:unit`) | 13.6 s | 11.7 s |
| parity tests | 78 | 78 |

`bun run typecheck` 0 errors · `bun run lint` 0 errors (189 pre-existing warnings) · `bun run test` green.

## Maestro flow 01 — create identity (user story 1)

`apps/expo/.maestro/01-create-identity.yaml`, Maestro 2.12.0, iPhone 17 simulator (iOS 27), Debug
build served by Metro on :8081, simulator language zh-Hant.

Steps: fresh install (clear state + keychain) → 開始 → username (random `e2e<n>`, read-only
availability check against creds.id) → 使用這個名稱 → Passkey 稍後再說 (local root key + iCloud
Keychain recovery copy) → **Links step reached** (`create-identity-pass.png`).

Runs after the flow was finished: 5 pass, 1 hang (details below). ~80–90 s per run, mostly the cold
JS bundle load.

### Stops before publishing — on purpose
The next step registers the name in the **production** creds.id directory and publishes to public
Nostr relays (`NIP05_SERVICE_ORIGIN` is hard-wired to `https://creds.id`; released names are
tombstoned forever). The flow continues to the Page once a dev build can point at a local creds.id
worker + relay.

### Debug-build friction handled in the flow
- The footer button sits under the keyboard → `hideKeyboard` first.
- A LogBox "Open debugger to view warnings" toast covers the footer button → closed when visible.
  (The underlying warning was not investigated.)

### Intermittent failure at 稍後再說 — diagnosed, not fixed
1 of 6 runs looked stuck on 「正在設定…」 (`create-identity-hang.png`). Diagnosed the same day
(probe-free Maestro loop, ~100 runs): it is **not a hang and not dev-only**.

- Rate: 4/28 and 7/29 probe-free runs. With fetch-based JS probes on every await: 0/41 — the probes
  shift JS-thread timing and hide it (a race).
- Symptom: the spinner, then the error sheet 「無法完成身分設定」. Report via 複製詳細資訊 →
  `Error: storageFailed` thrown at `if (!restored.ok)` in `PasskeyStep.prepareLocalIdentity`.
- Failure-path-only probe: `restore synced read failed: Timeouted: Promise<std::string> was destroyed!`
  — the keystone `getSynchronizableItem` read.
- Root cause: `react-native-nitro-modules` **0.35.7 `ios/core/Promise.swift` has no locking**.
  `Promise.async` resolves on a Swift-concurrency thread while the generated bridge attaches
  `.then`/`.catch` on the JS thread. A sub-millisecond keychain read can resolve between `then`
  reading `state == nil` and appending its listener → the listener is never called → the C++
  `Promise<std::string>` captured in it is destroyed pending and rejects with the message above.
  The C++ `Promise` is mutex-guarded; only the Swift one races. Upstream 0.37.x adds an `NSLock`
  around `resolve`/`reject`/`then`/`catch` — the same fix.
- Scope: any Nitro `Promise.async` on iOS whose body finishes fast, in Debug **and** Release
  (native code, not Metro). Onboarding is just where a fresh-install keychain miss makes it common.

Ruled out on the way: Metro lazy `import()` (the stall is after the keystone read is issued),
a touch-to-wake lost wakeup (a tap does not unstick it — it is already an error sheet), blocked
`getSecretsVault()` (no init / locks).
