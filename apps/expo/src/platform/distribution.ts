/**
 * Which store build this is, and what that build can do
 * (docs/ref/13-plan-fdroid.md).
 *
 * The F-Droid build is the Android app built with
 * `EXPO_PUBLIC_CREDS_DISTRIBUTION=fdroid`: Gradle leaves the non-free native
 * modules out (plugins/withFdroidFlavor.js) and Metro inlines the same variable
 * here. Screens read these flags and never the distribution string, so a
 * feature whose native module is missing is hidden, never a dead button.
 */
import { Platform } from 'react-native';

export type Distribution = 'store' | 'fdroid';

export const distribution: Distribution =
  Platform.OS === 'android' && process.env['EXPO_PUBLIC_CREDS_DISTRIBUTION'] === 'fdroid'
    ? 'fdroid'
    : 'store';

const isStore = distribution === 'store';

export const capabilities = {
  /** Play Billing / App Store purchase of Pro (expo-iap). */
  proPurchase: isStore,
  /** Page-design controls are free for everyone, without any entitlement. */
  designUnlockedByDistribution: !isStore,
  /** Passkeys and the root vault on creds.id (Play services Credential Manager). */
  passkeys: isStore,
  /** Cloud backup: iCloud on iOS, Google Drive (Play services sign-in) on Android. */
  cloudBackup: isStore,
  /** Passport MRZ camera scan (ML Kit text recognition on Android); manual entry stays. */
  passportScan: isStore,
  /** In-app QR scanner (expo-camera barcode scanning, ML Kit on Android). */
  qrScanner: isStore,
} as const;
