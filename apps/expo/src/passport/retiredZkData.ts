import { getMmkv } from '@/storage/mmkv';

/** MMKV keys the retired passport ZK path wrote (docs/ref/11 P2). */
const RETIRED_ZK_KEY_PREFIXES = ['passport.show-witness.v1:', 'passport.show-vk-self-pin.v1'];

/**
 * Drop what the retired passport ZK path left on this phone: the encrypted
 * show-witness bundles hold the chip's DG1, so they must not outlive the
 * feature that needed them.
 */
export function dropRetiredPassportZkData(): void {
  try {
    const mmkv = getMmkv();
    for (const key of mmkv.getAllKeys()) {
      if (RETIRED_ZK_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) mmkv.remove(key);
    }
  } catch {
    // MMKV not ready: the next launch retries.
  }
}
