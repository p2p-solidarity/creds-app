import { describe, expect, test } from 'bun:test';

import {
  deriveSecp256k1Scalar,
  HKDF_INFO_NOSTR,
  openRootVault,
  rootVaultLocator,
  rootVaultPrfInput,
  base64UrlEncode,
} from '@solidarity/shared';
import {
  connectRootIdentityToPasskey,
  createRootVaultUploadClient,
  type PasskeyPrfClient,
  type RootVaultUploadClient,
} from '../../src/identity/rootVaultSync';

const MNEMONIC =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';
const CREDENTIAL_ID = new Uint8Array([1, 2, 3, 4, 5]);
const PRF_OUTPUT = new Uint8Array(32).fill(7);

describe('root vault passkey sync', () => {
  test('creates one PRF passkey and uploads only a credential-bound ciphertext record', async () => {
    let uploaded:
      | { locator: string; record: { v: 1; ciphertext: string } }
      | undefined;
    const passkey: PasskeyPrfClient = {
      createCredential: async (input) => {
        expect(input.rpId).toBe('creds.id');
        expect(input.prfInput).toBe(base64UrlEncode(rootVaultPrfInput()));
        return {
          credentialId: base64UrlEncode(CREDENTIAL_ID),
          prfOutput: base64UrlEncode(PRF_OUTPUT),
        };
      },
    };
    const upload: RootVaultUploadClient = {
      put: async (locator, record) => {
        uploaded = { locator, record };
        return { ok: true, value: undefined };
      },
    };

    expect(
      await connectRootIdentityToPasskey({
        mnemonic: MNEMONIC,
        userName: 'Solidarity',
        passkey,
        upload,
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(uploaded?.locator).toBe(rootVaultLocator(CREDENTIAL_ID));
    expect(Object.keys(uploaded?.record ?? {}).sort()).toEqual([
      'ciphertext',
      'v',
    ]);
    expect(
      openRootVault(uploaded?.record, CREDENTIAL_ID, PRF_OUTPUT),
    ).toEqual({ ok: true, value: { mnemonic: MNEMONIC } });
  });

  test('keeps an imported Nostr authority encrypted and saves a retry before upload', async () => {
    const nostrScalar = deriveSecp256k1Scalar(MNEMONIC, HKDF_INFO_NOSTR);
    const events: string[] = [];
    let pendingRecord: { v: 1; ciphertext: string } | undefined;
    const result = await connectRootIdentityToPasskey({
      mnemonic: MNEMONIC,
      userName: 'Solidarity',
      nostrScalar,
      passkey: {
        createCredential: async () => ({
          credentialId: base64UrlEncode(CREDENTIAL_ID),
          prfOutput: base64UrlEncode(PRF_OUTPUT),
        }),
      },
      pending: {
        set: (_locator, record) => {
          events.push('pending');
          pendingRecord = record;
        },
        clear: () => events.push('clear'),
      },
      upload: {
        put: async () => {
          events.push('upload');
          return { ok: false, error: { kind: 'networkFailed' } };
        },
      },
    });

    expect(result).toEqual({ ok: false, error: { kind: 'networkFailed' } });
    expect(events).toEqual(['pending', 'upload']);
    expect(openRootVault(pendingRecord, CREDENTIAL_ID, PRF_OUTPUT)).toEqual({
      ok: true,
      value: { mnemonic: MNEMONIC, nostrScalar },
    });
  });

  test('fails closed without uploading when passkey creation is unavailable', async () => {
    let uploadCalled = false;
    const result = await connectRootIdentityToPasskey({
      mnemonic: MNEMONIC,
      userName: 'Solidarity',
      passkey: {
        createCredential: async () => {
          throw new Error('passkey_prf_unsupported');
        },
      },
      upload: {
        put: async () => {
          uploadCalled = true;
          return { ok: true, value: undefined };
        },
      },
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'unsupported', detail: 'passkey_prf_unsupported' },
    });
    expect(uploadCalled).toBe(false);
  });

  test('rejects a credential without a 32-byte PRF result', async () => {
    let uploadCalled = false;
    const result = await connectRootIdentityToPasskey({
      mnemonic: MNEMONIC,
      userName: 'Solidarity',
      passkey: {
        createCredential: async () => ({
          credentialId: base64UrlEncode(CREDENTIAL_ID),
          prfOutput: base64UrlEncode(new Uint8Array(16)),
        }),
      },
      upload: {
        put: async () => {
          uploadCalled = true;
          return { ok: true, value: undefined };
        },
      },
    });

    expect(result).toEqual({ ok: false, error: { kind: 'noPrf' } });
    expect(uploadCalled).toBe(false);
  });

  test('keeps the native provider failure as report detail and classifies by its code', async () => {
    const native =
      'passkey_prf_invalid_credential (CreatePublicKeyCredentialDomException: ' +
      'androidx.credentials.TYPE_SECURITY_ERROR: request canceled by policy)';
    const result = await connectRootIdentityToPasskey({
      mnemonic: MNEMONIC,
      userName: 'Solidarity',
      passkey: {
        createCredential: async () => {
          throw new Error(native);
        },
      },
      upload: { put: async () => ({ ok: true, value: undefined }) },
    });

    // "canceled" in the provider text must not turn a refusal into a silent cancel.
    expect(result).toEqual({
      ok: false,
      error: { kind: 'invalidCredential', detail: native },
    });
  });

  test('classifies a code the native bridge prefixed with its exception class', async () => {
    const result = await connectRootIdentityToPasskey({
      mnemonic: MNEMONIC,
      userName: 'Solidarity',
      passkey: {
        createCredential: async () => {
          throw new Error('java.lang.IllegalStateException: passkey_prf_cancelled');
        },
      },
      upload: { put: async () => ({ ok: true, value: undefined }) },
    });

    expect(result).toEqual({ ok: false, error: { kind: 'cancelled' } });
  });

  test('reports the HTTP status when the vault upload is refused', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response('{}', { status: 503 })) as unknown as typeof fetch;
    try {
      const result = await createRootVaultUploadClient('https://vault.test').put(
        'locator',
        { v: 1, ciphertext: 'AA' },
      );
      expect(result).toEqual({
        ok: false,
        error: { kind: 'networkFailed', detail: 'HTTP 503' },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
