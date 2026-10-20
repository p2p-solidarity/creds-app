import { describe, expect, test } from 'bun:test';

import { gcm } from '@noble/ciphers/aes.js';

import { base64UrlEncode, utf8ToBytes } from '../src/crypto';
import { deriveBackupKeyFromMnemonic, deriveSecp256k1Scalar, HKDF_INFO_NOSTR } from '../src/derive';
import {
  deriveRootVaultAccess,
  openRootVault,
  openRootVaultMeta,
  rootVaultLocator,
  rootVaultOwnerHash,
  sealRootVault,
  sealRootVaultMeta,
  type RootVaultMeta,
} from '../src/rootVault';

/** Frozen: changing the owner derivation orphans every indexed row. */
const OWNER_HASH_VECTOR = 'M3zjos4UqqdAGidcT5Tij_ZTCbMSI334kYomXi6e75k';

function sealWithAad(key: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Uint8Array {
  const nonce = new Uint8Array(12).fill(3);
  const body = gcm(key, nonce, aad).encrypt(plaintext);
  const out = new Uint8Array(12 + body.length);
  out.set(nonce, 0);
  out.set(body, 12);
  return out;
}

const MNEMONIC =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';
const CREDENTIAL_ID = new Uint8Array([1, 2, 3, 4, 5]);
const PRF_OUTPUT = new Uint8Array(32).fill(7);
const NONCE = new Uint8Array(12).fill(9);

describe('root vault', () => {
  test('round-trips only the mnemonic through a credential-bound ciphertext record', () => {
    const sealed = sealRootVault(
      MNEMONIC,
      CREDENTIAL_ID,
      PRF_OUTPUT,
      NONCE
    );

    expect(sealed.ok).toBe(true);
    if (!sealed.ok) return;

    expect(Object.keys(sealed.value).sort()).toEqual(['ciphertext', 'v']);
    expect(sealed.value.v).toBe(1);
    expect(sealed.value.ciphertext).not.toContain('legal');
    expect(rootVaultLocator(CREDENTIAL_ID)).not.toContain('AQIDBAU');

    expect(openRootVault(sealed.value, CREDENTIAL_ID, PRF_OUTPUT)).toEqual({
      ok: true,
      value: { mnemonic: MNEMONIC },
    });
  });

  test('round-trips an independently imported Nostr signing key inside the ciphertext', () => {
    const nostrScalar = deriveSecp256k1Scalar(MNEMONIC, HKDF_INFO_NOSTR);
    const sealed = sealRootVault(
      MNEMONIC,
      CREDENTIAL_ID,
      PRF_OUTPUT,
      NONCE,
      nostrScalar,
    );
    if (!sealed.ok) throw new Error('fixture failed to seal');

    expect(sealed.value.ciphertext).not.toContain('nostrKey');
    expect(openRootVault(sealed.value, CREDENTIAL_ID, PRF_OUTPUT)).toEqual({
      ok: true,
      value: { mnemonic: MNEMONIC, nostrScalar },
    });
  });

  test('fails closed when a different credential or PRF output is used', () => {
    const sealed = sealRootVault(MNEMONIC, CREDENTIAL_ID, PRF_OUTPUT, NONCE);
    if (!sealed.ok) throw new Error('fixture failed to seal');

    expect(
      openRootVault(
        sealed.value,
        new Uint8Array([9, 8, 7]),
        PRF_OUTPUT
      )
    ).toEqual({ ok: false, error: { kind: 'decryptFailed' } });
    expect(
      openRootVault(sealed.value, CREDENTIAL_ID, new Uint8Array(32).fill(8))
    ).toEqual({ ok: false, error: { kind: 'decryptFailed' } });
  });

  test('rejects invalid mnemonic and PRF inputs before producing ciphertext', () => {
    expect(
      sealRootVault('not a mnemonic', CREDENTIAL_ID, PRF_OUTPUT, NONCE)
    ).toEqual({ ok: false, error: { kind: 'invalidMnemonic' } });
    expect(
      sealRootVault(MNEMONIC, CREDENTIAL_ID, new Uint8Array(31), NONCE)
    ).toEqual({ ok: false, error: { kind: 'invalidPrfOutput' } });
    expect(
      sealRootVault(MNEMONIC, new Uint8Array(), PRF_OUTPUT, NONCE)
    ).toEqual({ ok: false, error: { kind: 'invalidCredential' } });
    expect(
      sealRootVault(
        MNEMONIC,
        CREDENTIAL_ID,
        PRF_OUTPUT,
        NONCE,
        new Uint8Array(32),
      ),
    ).toEqual({ ok: false, error: { kind: 'invalidRecord' } });
  });

  test('rejects records with extra plaintext metadata', () => {
    const sealed = sealRootVault(MNEMONIC, CREDENTIAL_ID, PRF_OUTPUT, NONCE);
    if (!sealed.ok) throw new Error('fixture failed to seal');

    expect(
      openRootVault(
        { ...sealed.value, did: 'did:key:must-not-be-stored' },
        CREDENTIAL_ID,
        PRF_OUTPUT
      )
    ).toEqual({ ok: false, error: { kind: 'invalidRecord' } });
  });
});

describe('root vault owner index', () => {
  const OTHER_MNEMONIC =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const LOCATOR = rootVaultLocator(CREDENTIAL_ID);
  const META: RootVaultMeta = {
    v: 1,
    label: 'Kidney 的 iPhone',
    credentialId: 'AQIDBAU',
    createdAt: '2026-10-20T08:00:00.000Z',
    platform: 'web',
    device: 'Chrome on macOS',
    aaguid: null,
  };

  function access(mnemonic: string) {
    const derived = deriveRootVaultAccess(mnemonic);
    if (!derived.ok) throw new Error('fixture failed to derive');
    return derived.value;
  }

  test('owner secret and meta key are deterministic per mnemonic and never equal each other or the backup key', () => {
    const a = access(MNEMONIC);
    const b = access(MNEMONIC);
    expect(a.ownerSecret).toEqual(b.ownerSecret);
    expect(a.metaKey).toEqual(b.metaKey);
    expect(a.ownerSecret.length).toBe(32);
    expect(a.metaKey.length).toBe(32);
    expect(a.ownerSecret).not.toEqual(a.metaKey);
    expect(a.ownerSecret).not.toEqual(deriveBackupKeyFromMnemonic(MNEMONIC));
    expect(access(OTHER_MNEMONIC).ownerSecret).not.toEqual(a.ownerSecret);
  });

  test('pins the owner hash so the app and the web index the same rows', () => {
    const hash = rootVaultOwnerHash(access(MNEMONIC).ownerSecret);
    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).not.toBe(base64UrlEncode(access(MNEMONIC).ownerSecret));
    expect(hash).toBe(OWNER_HASH_VECTOR);
  });

  test('rejects an invalid mnemonic instead of deriving an owner', () => {
    expect(deriveRootVaultAccess('legal winner thank year').ok).toBe(false);
  });

  test('round-trips metadata without exposing the label in the ciphertext', () => {
    const { metaKey } = access(MNEMONIC);
    const sealed = sealRootVaultMeta(META, LOCATOR, metaKey, NONCE);
    if (!sealed.ok) throw new Error('fixture failed to seal');
    expect(sealed.value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sealed.value).not.toContain('Chrome');
    expect(openRootVaultMeta(sealed.value, LOCATOR, metaKey)).toEqual({ ok: true, value: META });
  });

  test('metadata moved to another row does not open (bound to its locator)', () => {
    const { metaKey } = access(MNEMONIC);
    const sealed = sealRootVaultMeta(META, LOCATOR, metaKey, NONCE);
    if (!sealed.ok) throw new Error('fixture failed to seal');
    const otherLocator = rootVaultLocator(new Uint8Array([9, 9, 9]));
    expect(openRootVaultMeta(sealed.value, otherLocator, metaKey)).toEqual({
      ok: false,
      error: { kind: 'decryptFailed' },
    });
  });

  test("another identity's meta key cannot open the row", () => {
    const sealed = sealRootVaultMeta(META, LOCATOR, access(MNEMONIC).metaKey, NONCE);
    if (!sealed.ok) throw new Error('fixture failed to seal');
    expect(openRootVaultMeta(sealed.value, LOCATOR, access(OTHER_MNEMONIC).metaKey).ok).toBe(false);
  });

  test('refuses to seal metadata outside the strict shape or size', () => {
    const { metaKey } = access(MNEMONIC);
    const bad: unknown[] = [
      { ...META, extra: 1 },
      { ...META, platform: 'linux' },
      { ...META, label: 'x'.repeat(65) },
      { ...META, label: '' },
      { ...META, credentialId: 'not base64url!' },
      { ...META, createdAt: 'yesterday' },
      { ...META, aaguid: 'nope' },
    ];
    for (const value of bad) {
      expect(sealRootVaultMeta(value as RootVaultMeta, LOCATOR, metaKey).ok).toBe(false);
    }
  });

  test('a decryptable payload with the wrong shape is invalidRecord, not trusted', () => {
    const { metaKey } = access(MNEMONIC);
    const forged = base64UrlEncode(
      sealWithAad(metaKey, utf8ToBytes(JSON.stringify({ ...META, label: 'x'.repeat(200) })), utf8ToBytes(LOCATOR)),
    );
    expect(openRootVaultMeta(forged, LOCATOR, metaKey)).toEqual({
      ok: false,
      error: { kind: 'invalidRecord' },
    });
  });
});
