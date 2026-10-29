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

### Intermittent hang at 稍後再說 — not fixed
1 of 6 runs stayed on 「正在設定…」 for > 90 s (`create-identity-hang.png`). Native log: seven keychain
reads (`SecItemCopyMatching`), then no write; the app sat at ~1 % CPU, i.e. an await that never
resolved — most likely between `restoreRootKeyFromICloud` → `notFound` and `createFromFreshMnemonic`
persisting via `expo-secure-store`. That run was also the one where Metro lazily served
`expo-secure-store/build/SecureStore.bundle` mid-flow, so a dev-only lazy-bundle race is the leading
suspect — **unconfirmed**. The identity path has no timeout, so if it does happen in a release build
the user is stuck on a spinner. Needs its own diagnosis (identity/keychain = size L).
