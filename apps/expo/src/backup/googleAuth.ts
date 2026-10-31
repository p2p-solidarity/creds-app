/**
 * Google Sign-In wrapper for Drive backup — Android primary path; iOS opt-in.
 *
 * Scope: `drive.file` — per-file access limited to the files THIS app creates.
 * This MUST match the native Drive client (DriveClient.kt queries/writes in
 * `spaces=drive` with an app-created backup folder); the previous
 * `drive.appdata` scope could only reach the hidden appDataFolder space, so a
 * `drive.appdata` grant + `spaces=drive` query found nothing → Android backup
 * silently failed to authenticate/restore. `drive.file` is still NOT full
 * Drive access (the app only sees its own files) and backups remain
 * end-to-end encrypted, so the cloud provider only ever sees ciphertext.
 */
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/**
 * OAuth "Web application" client of GCP project `creds-id-app` (consent
 * screen "creds.id", published). Google Sign-In on Android needs it as
 * `webClientId`; the Android clients in the same project (package + debug /
 * upload / Play signing SHA-1) are matched by Play services, not passed here.
 * A client ID is public — every shipped app carries it — so it lives in source:
 * it used to come only from an uncommitted `.env.local` that no build had, and
 * Drive backup could never sign in. The env var still overrides it for dev.
 */
const CREDS_ID_WEB_CLIENT_ID =
  '783225893436-6fe01dd4hvqd3rg0vtr8s50eiqggts3g.apps.googleusercontent.com';

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  // `||`, not `??`: an empty `KEY=` line in a .env must fall back too.
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const webClientId = process.env['EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'] || CREDS_ID_WEB_CLIENT_ID;
  const iosClientId = process.env['EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'];
  GoogleSignin.configure({
    webClientId,
    iosClientId,
    scopes: [DRIVE_FILE_SCOPE],
    offlineAccess: true,
  });
  configured = true;
}

export interface GoogleSession {
  readonly email: string;
  readonly accessToken: string;
}

/** Prompt the user to sign in and grant Drive file access. */
export async function signInForDrive(): Promise<GoogleSession> {
  ensureConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  if (result.type !== 'success') throw new Error('google-sign-in-cancelled');
  const tokens = await GoogleSignin.getTokens();
  return { email: result.data.user.email, accessToken: tokens.accessToken };
}

/**
 * A current access token without UI. Throws when nobody is signed in.
 *
 * `staleToken` is the token Drive just answered 401 to: Play services hands
 * back its cached token until told otherwise, so it has to be cleared first
 * or `getTokens` returns the same expired one.
 */
export async function refreshDriveAccessToken(staleToken?: string): Promise<string> {
  ensureConfigured();
  if (staleToken) await GoogleSignin.clearCachedAccessToken(staleToken);
  // iOS keeps the signed-in user only in memory; restore it after a relaunch.
  // (Android reads the last account from Play services and needs no restore.)
  if (!GoogleSignin.getCurrentUser()) {
    const silent = await GoogleSignin.signInSilently();
    if (silent.type !== 'success') throw new Error('google-not-signed-in');
  }
  const tokens = await GoogleSignin.getTokens();
  return tokens.accessToken;
}

/** The connected Google account's email, or null — never opens UI. */
export function connectedGoogleEmail(): string | null {
  ensureConfigured();
  return GoogleSignin.getCurrentUser()?.user.email ?? null;
}

export async function signOut(): Promise<void> {
  ensureConfigured();
  await GoogleSignin.signOut();
}

export { statusCodes as googleStatusCodes };
