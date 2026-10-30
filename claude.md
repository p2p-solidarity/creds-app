# creds.id (repo: airmeishi) — Repo Guide for Agents

**The app is `apps/expo/` (Expo Router + React Native + TypeScript), shipped as creds.id.** The web half is the sibling repo `../airmeishi-web` (creds.id). The original SwiftUI app was deleted on 2026-06-27 (commit `3fd308e`). Any doc or comment referencing Swift files (`solidarity/Views/...`, `Color.Theme.*`, `Themed*ButtonStyle`, `solidarity.xcodeproj`) or "port of …swift" is historical naming — do NOT hunt for those files.

## Where truth lives (read in this order)

1. `apps/expo/CLAUDE.md` — the coding rulebook. Mandatory before editing anything under `apps/expo/`.
2. **Live plan**: `docs/ref/10-plan-simplify-and-verify.md` — 5 user stories (§1); social verification = **§3.11 local-first** (device attestation via App Attest / Android Key Attestation, viewer's own fetch, p2p witnesses, Pro-only creds.id notary witness, passport nullifier; built 2026-10-30, not yet run on a real device); one card / two QR forms (§4, P4) and hidden passport ZK (§5, P5) — **not built yet**. zkTLS / TLSNotary / notary-evidence sections (§2 notary parts, §3.1–§3.10) are retired history. Newer plans `docs/ref/11-*` take over pieces of 10 when present (UI rebrand + P4/P5, passport OpenAC review).
3. **Built mechanisms (still accurate)**: `08-plan-passkey-root-sync.md` (passkey PRF root vault, ciphertext-only service, owner index; Page content syncs through Nostr, not the vault), `09-plan-pro-entitlement.md` (IAP + license bridge), `05-spec-qr-exchange.md` (QR wire SSOT until P4 removes the chunk wires), `06-plan-convergence-2.0.0.md` (north star "company dies, page still works" and old-feature keep/cut; its Q2 is voided by 10).
4. **Background spec**: `docs/ref/01–03` (1.3.3 "Verified Page" spec; §6 of 03 = kept/evolved/frozen/deleted table). `notes-rebrand-audit-2026-10.md` = 2026-10-28 rebrand audit.
5. **History only**: `docs/archive/` (done or superseded plans and audits), `docs/ref/04-plan-app.md` (superseded 1.3.3 plan, still cited by code comments), `docs/ref/notes-archive-pre-2.0.0.md` (distilled pre-2.0.0 plans; `docs/superpowers` and `.superpowers` are deleted).
6. **STALE — do not trust**: `README.md`, `spec.md`, `architecture.png` describe the deleted SwiftUI app and pre-pivot architecture.

Evidence of what actually ran lives in `docs/e2e/<date>-<slug>/result.md` — check the "Not run" list there before claiming a feature works.

## Workflow — every coding task

1. Invoke the `flow` skill first: size the task S/M/L and follow its process. UI work also reads `.claude/skills/ui-polish/SKILL.md`.
2. Verify (global Rule 0): finish the feature → run it once for real (simulator / device / browser) and keep the evidence (screenshot, log, or `docs/e2e/<date>-<slug>/result.md`) → then run `bun run typecheck && bun run lint && bun run test` (unit + parity) once from repo root.
3. Parallel sessions: several sessions work on this repo at once. A feature session gets its own worktree under `.claude/worktrees/` cut from `2.0.0`; the main checkout may hold another session's uncommitted files (e.g. `project.pbxproj`, untracked `docs/e2e/*`). Commit only the files you changed (`git add <paths>`, never `-A`), and before blaming your change for a red baseline, check whether it was already red.
4. Monorepo (bun workspaces): `apps/expo` = the app; `packages/shared` = pure-TS crypto/types/verifiers consumed by app, web and workers (web vendors it — bump the version when you change it); `packages/parity-fixtures` = **frozen** golden vectors (never edit or regenerate); `nitro-modules/*` = native bridges (Swift/Kotlin behind TS specs).

## Security — hard rules (current TS terms)

- Sensitive paths: `apps/expo/src/{passport,keychain,identity,vault,witness}`, `packages/shared/src/{deviceproof,rootVault.ts,pro}` and `nitro-modules/{attest,keystone}` (attest = mrz-ocr+nfc-passport+semaphore+DeviceAttest; passport-zk removed in 11 P2; keystone = secrets-vault+spruce-did+cloudkit). Any change here is size **L** in flow — never S.
- Never read, print, or commit: `apps/expo/secrets/`, any `.env*`, `apps/expo/infra/terraform/terraform.tfstate*` / `terraform.tfvars`.
- Security-path errors use tagged unions (e.g. `BiometricResult`) — never throw raw, never swallow, never log PII.
- Face ID gates: `ALWAYS_PROMPT_ACTIONS` (rotateMasterKey, revealRecoveryBundle, deleteZKIdentity) deliberately bypass the biometric grace window (`apps/expo/src/keychain/sensitiveActionPolicy.ts`). Adding a grace period there is a security regression, not an optimization. Default gate mode is `redLineOnly` and showing your own card QR (`signOwnCard*`) never prompts — Kidney's call, 2026-10-30 (`docs/e2e/2026-10-30-faceid-prompts/result.md`); Pear `cardRelease` still always prompts.
- Nitro `ArrayBuffer` args are non-owning: touching `buffer.data`/`.size` inside `Promise.async` is an uncatchable native crash. Copy the bytes synchronously first. Treat every new HybridObject method with an ArrayBuffer param as suspect.
- Passport honesty: the app proves nothing about a passport in a circuit any more (`docs/ref/11` P2). L3 = passive auth + device-attested statement, L2 = passive auth on this phone only, L1 = unverified; ZK-era passport records display L1 and ask for a rescan. Never present a lower tier as a higher one.
- Witness honesty (10 §3.11): device attestation proves "genuine creds App on a real phone", not "a distinct person" — one phone can mint unlimited attested keys, so only the passport nullifier counts distinct people. The owner can never witness themselves (witness npub and device key must differ from the owner's). Badges say "checked by the creds App on a real phone", never "unforgeable".
- Threat-model defaults (each from a real caught bug): P2P transports scoped per-connection not per-topic; VC/VP must verify holder binding; OAuth discovery is https-only with host validation; no manual pre-hash before ES256 signing (the lib hashes); a URL the user (or someone else's Page) supplies and the phone then fetches — website checks, link thumbnails — must go through the https-only / no-private-IP guard in `apps/expo/src/profile/httpsOwnership.ts`; a Nostr writer must not treat a blind read (no relay EOSE) as "no existing record".

## Traps (verified 2026-10-30)

- `.claude/worktrees/*` are other sessions' live checkouts — **exclude them from every search**, and never edit them from here.
- Root `ios/`, `android/`, `app.json`, `solidarity.xcodeproj/`, `ci_scripts/` are stale artifacts. Real native projects: `apps/expo/{ios,android}` (regenerated by prebuild). Real CI script source: `apps/expo/ci-scripts/ci_post_clone.sh`.
- `packages/parity-fixtures/` is frozen: the Swift `FixtureExporter` that generated it was deleted — never regenerate or edit fixtures (its README explains the policy).
- No fake data — ever: data-driven UI renders exactly `loading` / `ready` / `error`; never a plausible placeholder. Full rule with examples: `apps/expo/CLAUDE.md` Rule 8.
- App Attest does not exist on simulators: anything in the witness / device-key path can only be proven on a real device.

## Build

iOS 26 / Android minSdk 29. Bundle id `kidneyweakx.airmeishi`. iOS releases via Xcode Cloud; `-skipPackagePluginValidation` is required by SPM plugin validation (explanation in `apps/expo/ci-scripts/ci_post_clone.sh`).
