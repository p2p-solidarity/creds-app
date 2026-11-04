export {
  isBiometricAvailable,
  requireBiometric,
  setBiometricGraceEnabled,
  type BiometricReason,
} from './biometric';
export {
  ensureSigningKey,
  hasExistingSigningKey,
  publicJwk,
  signJwt,
  signRawEs256,
  didKeyForCurrentIdentity,
  deleteSigningKey,
  quiesceSigningKeyOperations,
  resetSigningKeyForTesting,
  type SigningIdentity,
} from './signingKey';
export {
  pairwisePrivateKey,
  pairwisePublicJwk,
  deletePairwiseSeed,
  quiescePairwiseSeedOperations,
  resetPairwiseSeedForTesting,
} from './pairwiseKey';
export {
  BIOMETRIC_GATE_MODES,
  RED_LINE_ACTIONS,
  SENSITIVE_ACTIONS,
  getSensitivePolicyFor,
  getSensitivePolicySnapshot,
  hydrateSensitiveActionPolicy,
  resetSensitiveActionPolicyForTesting,
  useSensitiveActionPolicy,
  type BiometricGateMode,
  type SensitiveAction,
  type SensitiveActionEntry,
  type SensitiveActionPolicy,
} from './sensitiveActionPolicy';
export {
  requireSensitiveAction,
  type BiometricFailureReason,
  type BiometricResult,
  type BiometricSuccessMethod,
} from './biometricGatekeeper';
