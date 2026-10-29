import { afterEach, describe, expect, it } from 'bun:test';

import type { Semaphore } from '@solidarity/nitro-attest';

import { deleteIdentityForLocalWipe } from '../../src/zk/identity';
import {
  __setSemaphoreNativeForTesting,
  __setSemaphoreNativeUnavailableForTesting,
} from '../../src/zk/nativeBridge';

afterEach(() => {
  __setSemaphoreNativeUnavailableForTesting(false);
  __setSemaphoreNativeForTesting(null);
});

describe('deleteIdentityForLocalWipe', () => {
  it('fails closed when the native identity module cannot be loaded', async () => {
    __setSemaphoreNativeUnavailableForTesting(true);

    expect(await deleteIdentityForLocalWipe()).toEqual({
      ok: false,
      error: { kind: 'storageFailed' },
    });
  });

  it('maps a native deletion rejection to a redacted typed failure', async () => {
    __setSemaphoreNativeForTesting({
      deleteIdentity: () => Promise.reject(new Error('private native detail')),
    } as unknown as Semaphore);

    const result = await deleteIdentityForLocalWipe();

    expect(result).toEqual({
      ok: false,
      error: { kind: 'storageFailed' },
    });
    expect(JSON.stringify(result)).not.toContain('private native detail');
  });
});
