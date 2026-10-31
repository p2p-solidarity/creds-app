# 2026-11-01 — Android Google Drive backup

Device: Android emulator `aniseekr_test` (google_apis arm64, debug dev client, metro :8081).

## Root causes found
1. `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` had no value anywhere → Google Sign-In could never configure. Now the creds-id-app Web client ID is in `src/backup/googleAuth.ts` (env still overrides).
2. `backupProvider` preference defaults to `'iCloud'` on every platform → Android never fetched a Drive token. `setProvider` now forces `googleDrive` on Android.
3. First Drive token latched forever → every Drive op 401 an hour after launch. Token is now fetched per operation (single-flight) and a 401 clears the cached token and retries once.
4. Backup screen copy hard-coded iCloud; Drive had no way to connect an account.

## OAuth (GCP `creds-id-app`, published)
Web client + Android clients for package `gg.solidarity.app` with debug / upload / Play-signing SHA-1. Debug APK cert SHA-1 checked with apksigner = 5e8f1606…f625 (matches the debug client).

## Ran
- Backup screen on Android reads "Google Drive Backup" / "Checking Google Drive…" and shows the Google account → Connect row (`backup-screen-not-connected.png`).
- Tapping Connect opens Google's add-account flow (`google-add-account.png`; emulator had no Google account).

## Not run (yet)
- Signing in with a real Google account, back up now, History list, restore — needs a human to sign in on the emulator.
- Token expiry / 401 retry path (needs > 1 h or a revoked token).
- Play-signed build (upload / Play signing clients).
- iOS: unchanged path, not run.
