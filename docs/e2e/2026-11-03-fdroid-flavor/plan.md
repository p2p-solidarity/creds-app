# E2E plan — F-Droid flavor (2026-11-03)

Build under test: `EXPO_PUBLIC_CREDS_DISTRIBUTION=fdroid ./gradlew :app:assembleFdroidRelease
-PreactNativeArchitectures=arm64-v8a` from branch `claude/fdroid-flavor-297c83`
(release JS bundle, so the env variable is inlined exactly as F-Droid would ship it).
Device: the existing AVD `aniseekr_test` (Android 16 / API 36, arm64, google_apis image).

Remote state: the AVD runs with Wi-Fi and mobile data **off** after install, so
onboarding's background name publish to creds.id fails and nothing is
registered on the production directory or relays. No account, no remote write.

Baseline: app not installed on the AVD (`pm list packages gg.solidarity.app` empty)
before install; fresh install = fresh onboarding state.

| ID | Goal | Steps | Expected | Verified at |
|---|---|---|---|---|
| C1 | Classpath is Google-free | `:app:dependencies --configuration fdroidReleaseRuntimeClasspath` | no `com.google.android.gms`, `com.google.mlkit`, `com.google.firebase`, `billingclient` | `deps-fdroid.txt` grep (count 0) |
| C2 | APK carries no Google/ML Kit/billing code | dump class list of the APK's dex files | no class under `com/google/android/gms`, `com/google/mlkit`, `com/google/firebase`, `com/android/billingclient`, `expo/modules/iap`, `expo/modules/camera`, `com/reactnativegooglesignin` | `apk-classes.txt` grep |
| C3 | App launches | install APK, launch | welcome screen visible; no `FATAL EXCEPTION` for the app in logcat | screenshot `c3-launch.png`, `logcat-c3.txt` |
| C4 | Onboarding identity step has no passkey | welcome → name → step 3 | title "Identity protection", one button "Create My Keys", no "Connect Passkey"/"Not Now"; tapping it advances to the links step | screenshots `c4-*` |
| C5 | Settings hub hides passkey / plan / cloud backup | finish onboarding (Browse), open Settings | no Passkeys row, no Plan section, no backup row; Recovery Phrase row present | screenshot `c5-settings.png` + UI dump |
| C6 | Me page has no "Edit on your computer" | open Page tab | row absent | UI dump `c6-me.xml` |
| C7 | Design controls unlocked, no paywall | Page → appearance sheet: tap 3rd font, custom colour field, brand switch | fonts past index 1 show no Pro tag and apply; custom colour field is editable; brand switch toggles; no paywall screen opens | screenshots `c7-*` |
| C8 | Pro blocks unlocked in the add sheet | Page → Add | block rows carry no Pro badge; adding one shows "added to draft" toast, no paywall | screenshot `c8-*` |
| C9 | No QR scanner entry | People → Add | no "Scan their QR" row | screenshot `c9-people-add.png` |
| C10 | Passport opens on manual entry | `/passport` via Page add sheet → proof | details form shown directly, no Scan button, no "back to scan" | screenshot `c10-passport.png` |
| C11 | Hidden routes redirect | `adb shell am start -d credsid://settings/pro` (and `/settings/passkeys`) | lands on Settings, not the paywall / passkey list | screenshot `c11-*` |
| C12 | Play build still builds | `./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a` (no env) | BUILD SUCCESSFUL, output at `apk/release/app-release.apk` (flavorless path) | `build-play.txt` |

Cleanup: uninstall the app, re-enable AVD network, `adb emu kill`.
