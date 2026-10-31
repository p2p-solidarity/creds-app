# 2026-11-01 — Android passkey "RP ID cannot be validated"

Device: Galaxy S20 FE (SM-G781B), Android 13, GMS 26.42.31. App: vc29 installed fresh from Play internal testing (signed with the Play app-signing key `E8:04…4B:BA`, checked with apksigner).

## Root cause
GMS `ValidateRpIdOperation` returned `[50152] RP ID cannot be validated` (`before-50152.png`, `logcat-excerpt.txt`) even though creds.id assetlinks listed the right package and both fingerprints and Google's DAL `assetlinks:check` said `linked: true`. Restarting GMS and trimming caches changed nothing.

The assetlinks statement only had `delegate_permission/common.get_login_creds`. Android's Credential Manager prerequisites ask for `handle_all_urls` **and** `get_login_creds`. After adding `handle_all_urls` (airmeishi-web, deployed to creds.id), the very next attempt passed validation and GMS recorded the passkey.

## Ran
- Fresh onboarding → username → Connect Passkey → Google Password Manager sheet (`gpm-sheet.png`) → Continue → no error, onboarding moved on to the links step (`after-created.png`).

## Not run
- Sign-in / PRF assertion on a second launch, and the root vault restore from creds.id web.
- Android 10/11: vc29 ships `minSdk=32` (vc22 had 29), so those devices can't install it; cause not traced.
- Side effect not checked: `handle_all_urls` makes the app's `autoVerify` creds.id App Links verified, so creds.id links on Android now open the app.
