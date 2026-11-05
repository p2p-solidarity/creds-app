/**
 * Verify-only Semaphore group proof check for old-format QR envelopes.
 * Removed together with those wires (10 §4).
 */
import type { SemaphoreProof } from '@solidarity/nitro-attest';

import { loadSemaphoreNative } from './nativeBridge';

/** False on any failure, including a missing native module. */
export async function verifyGroupProof(
  proof: SemaphoreProof,
  merkleTreeDepth = 16
): Promise<boolean> {
  const native = await loadSemaphoreNative();
  if (!native) return false;
  try {
    return await native.verifyProof(proof, merkleTreeDepth);
  } catch {
    return false;
  }
}
