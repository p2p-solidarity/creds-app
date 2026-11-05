# Plan — code cleanup (docs/ref/14) E2E

Device: iPhone 18 Pro simulator (iOS 27.2), Debug dev client built from this worktree, Metro :8082 from this worktree.
Android: existing AVD, release-ish build from this worktree (final).
Harness: temporary `src/e2eLegacyProbe.ts` (never committed) seeds legacy data and logs `[e2e-legacy]` snapshots to Metro.

| ID | Goal | Steps | Expected | Verified at |
|---|---|---|---|---|
| C1 | iOS cold start | install, launch, open dev client on :8082 | onboarding renders, boot log reaches `show-app`, no redbox | screenshot + Metro log |
| C2 | Face-ID-gated Settings action still gated (phase 2 keychain edits) | onboard → Settings → Reset app data (requireSensitiveAction) | Face ID prompt shown; on match, toast + back to onboarding | screenshot + log |
| C3 | legacy data seeded | mode seedKeepMarker, reload | `before` snapshot: 5 legacy MMKV keys, vaultSecret/sakura/wrapKeyV2/semaphoreIdentity/nullifier all true | Metro log |
| C4 | Settings wipe removes legacy data (phase 3) | Settings → Developer → wipe → Face ID; then mode probe + relaunch | wipe done alert, app at onboarding; `before` snapshot: legacyMmkv [], all secrets false | screenshot + Metro log |
| C5 | boot legacyWipe | mode seedBoot, relaunch | `before` all present; `after4s` all absent, marker "1" | Metro log |
| C6 | social verify panel (phase 4 rename) | open verify panel for a link | panel renders, no raw `zktls.`/`socialProof.` keys | screenshot |
| C7 | Android cold start (final) | install build, launch | onboarding renders, no crash in logcat | screenshot + logcat |

## §8 Pear / bare-kit removal (phase 4b) — added after Kidney's 2026-11-04 decision

Baselines (docs/e2e/2026-11-04-app-size-dead-deps): Android arm64 download 68.35 MB (`bundletool get-size total --dimensions=ABI`), iOS Release archive `.app` 128 MB.

| ID | Goal | Steps | Expected | Verified at |
|---|---|---|---|---|
| C8 | Android size | `bundleRelease` arm64 (template debug signing; no release keystore in the worktree) → `bundletool get-size total --dimensions=ABI` | arm64 download well below 68.35 MB; no `libbare-kit.so` in the AAB | bundletool output + `unzip -l` |
| C9 | Android cold start + saved Page | install release APKs on AVD `aniseekr_test`, launch; save a Page into People, reopen it | logcat reaches `show-app:boot-complete`, no FATAL / UnsatisfiedLink; detail screen renders the Page | logcat + screenshot |
| C10 | iOS size | Release archive (generic/platform=iOS) | `.app` well below 128 MB; no `BareKit.framework` | `du -sh` + `ls Frameworks` |
| C11 | iOS cold start + saved Page | Release sim build on iPhone 18 Pro; save a Page into People, reopen it | onboarding/tabs render; detail screen renders the Page | screenshot |
