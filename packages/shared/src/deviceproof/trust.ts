/**
 * Who creds accepts device proofs from (docs/ref/10 §3.11): our App ID and
 * package, the app-signing certificates, and the pinned vendor roots. One
 * constant so the app, creds.id and the Pro notary count the same witnesses.
 */
import { base64Decode, hexToBytes } from '../crypto';
import { APPLE_APP_ATTEST_ROOT_B64, GOOGLE_EC_ROOT_B64, GOOGLE_RSA_ROOT_B64 } from './roots';
import type { DeviceProofTrust } from './witness';

/** `<TeamID>.<bundle id>` of the creds iOS app. */
export const CREDS_APPLE_APP_ID = '538MCM44UX.kidneyweakx.airmeishi';
export const CREDS_ANDROID_PACKAGE = 'gg.solidarity.app';

/**
 * SHA-256 of the certificates Android installs are signed with. Play
 * re-signs store installs with the Play app-signing key, which is NOT listed
 * yet (pending from Play Console, docs/ref/10 §3.11) — until it is, only
 * builds signed with the upload key (the one creds.id's assetlinks lists)
 * can witness.
 */
export const CREDS_ANDROID_SIGNATURE_DIGESTS_HEX: readonly string[] = [
  'be3844b19f74375e9b6f9c8ac9349fcff5347ee45f556f8c27172e901f3e2de8', // upload key
];

/**
 * Hex pubkey(s) of the creds.id Pro notary's Nostr key. Empty until the
 * notary key is provisioned (`apps/notary/scripts/witness-key.ts`): until
 * then no notary witness counts.
 */
export const CREDS_NOTARY_WITNESS_PUBKEYS: readonly string[] = [];

export const CREDS_DEVICE_TRUST: DeviceProofTrust = {
  appleAppId: CREDS_APPLE_APP_ID,
  appleEnvironment: 'production',
  appleRoots: [base64Decode(APPLE_APP_ATTEST_ROOT_B64)],
  androidPackage: CREDS_ANDROID_PACKAGE,
  androidSignatureDigests: CREDS_ANDROID_SIGNATURE_DIGESTS_HEX.map(hexToBytes),
  googleRoots: [base64Decode(GOOGLE_RSA_ROOT_B64), base64Decode(GOOGLE_EC_ROOT_B64)],
  notaryPubkeys: CREDS_NOTARY_WITNESS_PUBKEYS,
};
