import * as FileSystem from 'expo-file-system/legacy';

import { getMmkv } from '@/storage/mmkv';
import {
  canCommitLocalData,
  captureLocalDataEpoch,
  trackLocalDataOperation,
  type LocalDataEpoch,
} from '@/settings/localDataWipeBarrier';
import { err, ok, type Result, uuid } from '@solidarity/shared';

const LOCAL_AVATAR_KEY = 'profile:local-avatar:v1';
const LOCAL_AVATAR_DIR = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}profile-avatar/`
  : null;

const AVATAR_FILE_NAME = /^avatar-[A-Za-z0-9-]+$/;

/**
 * iOS moves the app container (new UUID in the path) on every app update, so a
 * stored absolute URI goes stale. Keep only our file name and rebase it onto
 * the current documents directory.
 */
function resolveOwnedAvatarUri(value: string): string | null {
  if (LOCAL_AVATAR_DIR === null) return null;
  const marker = '/profile-avatar/';
  const at = value.lastIndexOf(marker);
  if (at === -1) return null;
  const name = value.slice(at + marker.length);
  return AVATAR_FILE_NAME.test(name) ? `${LOCAL_AVATAR_DIR}${name}` : null;
}

/** Sync mirror read for frame-one rendering after the root MMKV bootstrap. */
export function readLocalAvatarUri(): string | null {
  try {
    const value = getMmkv().getString(LOCAL_AVATAR_KEY);
    return value ? resolveOwnedAvatarUri(value) : null;
  } catch {
    return null;
  }
}

/** Copy a picker-owned temporary asset into app documents, then update MMKV. */
export function persistLocalAvatar(
  sourceUri: string
): Promise<Result<string, 'unavailable'>> {
  return trackLocalDataOperation(
    persistLocalAvatarAtEpoch(sourceUri, captureLocalDataEpoch()),
  );
}

async function persistLocalAvatarAtEpoch(
  sourceUri: string,
  writeEpoch: LocalDataEpoch,
): Promise<Result<string, 'unavailable'>> {
  if (
    !LOCAL_AVATAR_DIR ||
    sourceUri.length === 0 ||
    !canCommitLocalData(writeEpoch)
  ) {
    return err('unavailable');
  }
  const destination = `${LOCAL_AVATAR_DIR}avatar-${uuid()}`;
  const previous = readLocalAvatarUri();

  try {
    const directory = await FileSystem.getInfoAsync(LOCAL_AVATAR_DIR);
    if (!canCommitLocalData(writeEpoch)) return err('unavailable');
    if (!directory.exists) {
      await FileSystem.makeDirectoryAsync(LOCAL_AVATAR_DIR, { intermediates: true });
      if (!canCommitLocalData(writeEpoch)) return err('unavailable');
    }
    await FileSystem.copyAsync({ from: sourceUri, to: destination });
    if (!canCommitLocalData(writeEpoch)) return err('unavailable');
    getMmkv().set(LOCAL_AVATAR_KEY, destination);
    if (previous && previous !== destination) {
      await FileSystem.deleteAsync(previous, { idempotent: true }).catch(() => undefined);
    }
    return ok(destination);
  } catch {
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
    return err('unavailable');
  }
}

/** Remove only the app-owned avatar file named by our private MMKV key. */
export async function removeLocalAvatar(): Promise<Result<void, 'unavailable'>> {
  const current = readLocalAvatarUri();
  try {
    if (current) await FileSystem.deleteAsync(current, { idempotent: true });
    getMmkv().remove(LOCAL_AVATAR_KEY);
    return ok(undefined);
  } catch {
    return err('unavailable');
  }
}
