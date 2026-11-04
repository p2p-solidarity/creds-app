/**
 * Identity module — IdentityDataStore / VerifiedClaimIndex /
 * IdentityCoordinator. Consumers should import from this barrel
 * rather than reaching into individual files.
 */
export type {
  IdentityCardEntity,
  ProvableClaimEntity,
  TrustLevel,
} from './entities';
export { sourceCredentialId } from './entities';
export {
  displayClaims,
  useDisplayClaims,
  useIdentityData,
} from './dataStore';
export {
  claimsForHolder,
  useVerifiedFields,
  verifiedFieldsForHolder,
} from './verifiedClaimIndex';
export {
  useActiveDid,
  useIdentityCoordinator,
} from './coordinator';
export type { DIDDescriptor, UnifiedProfile } from './coordinator';
export {
  useIssuerTrustAnchorStore,
  type TrustAnchor,
  type TrustAnchorSource,
} from './issuerTrustAnchor';
// NOTE: `__setRootKeyBiometricGateForTesting` / `__setRootKeyStorageForTesting`
// / `__setRootKeySyncStorageForTesting` are deliberately NOT re-exported
// here — they are test-only DI hooks and this barrel is the production
// import surface. `__tests__/unit/rootKey.test.ts` already imports them
// directly from `./rootKey`; keep it that way rather than shipping test
// seams through app code's import path.
export {
  clearSyncedRootKey,
  createFromFreshMnemonic,
  deleteRootKeyForLocalWipe,
  deriveDidFromMnemonic,
  enableICloudBackup,
  getPortableBackupKey,
  getRootDid,
  getRootSigner,
  hasRootKey,
  importFromMnemonic,
  quiesceRootKeyOperations,
  restoreRootKeyFromICloud,
  revealMnemonicForExport,
  type BiometricGate,
  type RootKeyError,
  type RootKeyRecovery,
  type RootKeyStorage,
} from './rootKey';
