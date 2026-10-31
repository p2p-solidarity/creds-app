# 2026-10-31 — Android / UI fix batch

Device: Android emulator `aniseekr_test` (debug dev client, metro :8081). iOS 18 Pro sim: build only.

## Ran
- Android dev client built: Kotlin `ArrayBuffer` copy-before-async fix compiles (signJws, signRawP256, wrap, unwrap, identityFromSeed, importPrivateKey).
- iOS dev client built: Swift passkey `providerFailed` detail compiles.
- Fresh onboarding on Android → Recovery Phrase screen shows the root DID immediately, no reveal needed (`a14.png`).
- Bio save on Android: saves and shows on the Page in ~2–4 s (`d6.png`).
- Manual contact + swipe-to-delete on the refactored People row (`g5.png`).
- `bun run typecheck` 0 errors, `bun run lint` 0 errors.

## Found, not fixed
- Android bio sheet: with the keyboard up, the first Save tap only hides the keyboard and does not save (`e1.png`, reproduced twice; `keyboardShouldPersistTaps="always"` did not help). Likely the keyboard-hide resize cancelling the press.

## Not run
- Create did:key VC end to end: needs a legacy business card, which a fresh install can't create.
- Selecting / batch-deleting a saved Page (no saved Page on the test device).
- Passkey create (would register a real record on creds.id).
- Avatar sheet radius visual check; iOS UI (sim text field wouldn't take focus via the tool).
- `bun run test` full suite; `rootVaultSync.test.ts` is red on HEAD too (can't load react-native under bun).
- Test name `@e2etest1031x` was published by onboarding.
