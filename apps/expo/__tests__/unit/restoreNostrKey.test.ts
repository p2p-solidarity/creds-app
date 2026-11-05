/**
 * Restoring a root must leave the Nostr key of THAT root on the device
 * (docs/e2e/2026-11-05-nip17-verify 順便發現: a restored identity published as
 * the previous identity's npub because the old scalar survived in Keychain).
 *
 * Seam: `importFromMnemonic` (rootKey.ts) → `getNostrPubkey` (userKey.ts),
 * wired for real through rootKey's activation hook; only the two keychain
 * stores are in-memory fakes. Expected pubkeys come from
 * `packages/shared/vectors/derive.json` and the nostr-tools NIP-19 vector.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import derivedVectors from '../../../../packages/shared/vectors/derive.json';
import { __resetLocalDataWipeBarrierForTesting } from '../../src/settings/localDataWipeBarrier';

type Res<T, E = unknown> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

interface RootKeyMod {
  readonly __setRootKeyStorageForTesting: (storage: unknown) => void;
  readonly __setRootActivationHookForTesting: (hook: null) => void;
  readonly importFromMnemonic: (m: string) => Promise<Res<{ readonly did: string }>>;
  readonly deleteRootKey: () => Promise<void>;
}

interface UserKeyMod {
  readonly __setNostrKeyStorageForTesting: (storage: unknown) => void;
  readonly __setNostrKeyMirrorStorageForTesting: (storage: unknown) => void;
  readonly __setNostrMnemonicRevealerForTesting: (revealer: unknown) => void;
  readonly getNostrPubkey: () => Promise<Res<string, string>>;
  readonly importNsec: (nsec: string) => Promise<Res<string, string>>;
  readonly provisionFromRootMnemonic: () => Promise<Res<string, string>>;
  readonly deleteNostrKey: () => Promise<void>;
}

const [vectorA, vectorB] = derivedVectors.valid;
const REFERENCE_NSEC = 'nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5';
const REFERENCE_PUBKEY_HEX = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';

const rootStore = new Map<string, string>();
const nostrStore = new Map<string, string>();
let failNostrWrite = false;
let failNostrDelete = false;

let rootKey: RootKeyMod;
let userKey: UserKeyMod;

beforeAll(async () => {
  rootKey = (await import('../../src/identity/rootKey')) as unknown as RootKeyMod;
  userKey = (await import('../../src/nostr/userKey')) as unknown as UserKeyMod;
  rootKey.__setRootKeyStorageForTesting({
    getMnemonic: () => Promise.resolve(rootStore.get('m') ?? null),
    setMnemonic: (m: string) => { rootStore.set('m', m); return Promise.resolve(); },
    deleteMnemonic: () => { rootStore.delete('m'); return Promise.resolve(); },
  });
  rootKey.__setRootActivationHookForTesting(null);
  userKey.__setNostrKeyStorageForTesting({
    getScalarHex: () => Promise.resolve(nostrStore.get('s') ?? null),
    setScalarHex: (hex: string) => {
      if (failNostrWrite) return Promise.reject(new Error('keychain write failed'));
      nostrStore.set('s', hex);
      return Promise.resolve();
    },
    deleteScalarHex: () => {
      if (failNostrDelete) return Promise.reject(new Error('keychain delete failed'));
      nostrStore.delete('s');
      return Promise.resolve();
    },
  });
  userKey.__setNostrKeyMirrorStorageForTesting({ getHasKey: () => false, setHasKey: () => {} });
  userKey.__setNostrMnemonicRevealerForTesting(() =>
    Promise.resolve({ ok: true, value: rootStore.get('m') }),
  );
});

beforeEach(() => {
  rootStore.clear();
  nostrStore.clear();
  failNostrWrite = false;
  failNostrDelete = false;
  __resetLocalDataWipeBarrierForTesting();
});

afterEach(() => {
  failNostrWrite = false;
  failNostrDelete = false;
});

async function pubkey(): Promise<string | null> {
  const r = await userKey.getNostrPubkey();
  return r.ok ? r.value : null;
}

describe('restoring a root replaces a Nostr key that belongs to another root', () => {
  it('a device holding root A\'s derived key publishes as root B after restoring B', async () => {
    await rootKey.importFromMnemonic(vectorA!.mnemonic);
    expect(await pubkey()).toBe(vectorA!.nostrPubkeyHex);

    const restored = await rootKey.importFromMnemonic(vectorB!.mnemonic);
    expect(restored.ok).toBe(true);
    expect(await pubkey()).toBe(vectorB!.nostrPubkeyHex);
  });

  it('an nsec imported under root A does not survive restoring root B', async () => {
    await rootKey.importFromMnemonic(vectorA!.mnemonic);
    await userKey.importNsec(REFERENCE_NSEC);
    expect(await pubkey()).toBe(REFERENCE_PUBKEY_HEX);

    await rootKey.importFromMnemonic(vectorB!.mnemonic);
    expect(await pubkey()).toBe(vectorB!.nostrPubkeyHex);
  });

  it('re-importing the same root keeps the nsec the user imported under it', async () => {
    await rootKey.importFromMnemonic(vectorA!.mnemonic);
    await userKey.importNsec(REFERENCE_NSEC);

    await rootKey.importFromMnemonic(vectorA!.mnemonic);
    expect(await pubkey()).toBe(REFERENCE_PUBKEY_HEX);
  });

  it('a pre-fix stale key with no root binding is replaced on restore (heals affected devices)', async () => {
    nostrStore.set('s', '67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa');
    await rootKey.importFromMnemonic(vectorB!.mnemonic);
    expect(await pubkey()).toBe(vectorB!.nostrPubkeyHex);
  });

  it('a key provisioned by the Face ID path is replaced when another root is restored', async () => {
    await rootKey.importFromMnemonic(vectorA!.mnemonic);
    await userKey.deleteNostrKey();
    await userKey.provisionFromRootMnemonic();
    expect(await pubkey()).toBe(vectorA!.nostrPubkeyHex);

    await rootKey.importFromMnemonic(vectorB!.mnemonic);
    expect(await pubkey()).toBe(vectorB!.nostrPubkeyHex);
  });

  it('if the new key cannot be written the stale key is removed, never kept', async () => {
    await rootKey.importFromMnemonic(vectorA!.mnemonic);
    failNostrWrite = true;

    await rootKey.importFromMnemonic(vectorB!.mnemonic);
    const after = await userKey.getNostrPubkey();
    expect(after.ok).toBe(false);
  });

  it('if the stale key can be neither replaced nor removed the restore fails closed', async () => {
    await rootKey.importFromMnemonic(vectorA!.mnemonic);
    failNostrWrite = true;
    failNostrDelete = true;

    const restored = await rootKey.importFromMnemonic(vectorB!.mnemonic);
    expect(restored.ok).toBe(false);
    if (!restored.ok) {
      expect(JSON.stringify(restored.error)).not.toContain(vectorB!.mnemonic.split(' ')[0]!);
    }
  });
});
