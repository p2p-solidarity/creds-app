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

## vc30 (Play internal, same phone, 2026-11-01 01:50)
Built with `build:android:local`, submitted (EAS 4f09c49d), updated from Play on the S20 FE.
- minSdk: the AAB is still 29. bundletool also emits an API 32+ variant, which is what an Android 13 phone installs, so `dumpsys` shows 32. Android 10/11 get the 29 variant. No change needed.
- Page header on a 360dp screen: the three actions now sit at the top, above the name (`vc30-header.png`).
- Single contact: sits right under its `#` header (`vc30-single-contact.png`). Cause: Reanimated `entering` inside FlashList v2 cells held the row at the cell's first estimated frame.
- Drive backup: Google account picker opens on the Play-signed build; after connecting, back-up-now wrote two backups and History lists them (`vc30-drive-backup.png`).

## Still open
- Bio sheet on Android: with the keyboard up, the first tap on Save only hides the keyboard (the app itself calls hideSoftInputFromWindow); the second tap saves. Removing KeyboardAwareScrollView did not fix it. Needs a dev build on the phone to see which JS path blurs the input.
- Backup screen sync row showed 「同步未完成」 right after connecting. cloudSync collapses every failure to 'error' with no detail and release builds print no JS logs, so the cause is unknown.
