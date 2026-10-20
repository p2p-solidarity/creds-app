import { expect, test } from 'bun:test';
import { base64UrlEncode } from '@solidarity/shared';
import { connectRootIdentityToPasskey } from '../../src/identity/rootVaultSync';
import { createPasskeyRegistry } from '../../src/identity/passkeyRegistry';

const mnemonic = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

test('shared connection records pending before PUT and synced after, passing all exclusions', async () => {
  const values = new Map<string, string>();
  const registry = createPasskeyRegistry({ getString: key => values.get(key), set: (key, value) => { values.set(key, value); } });
  let pendingMetadata: unknown;
  const result = await connectRootIdentityToPasskey({
    mnemonic, userName: 'Solidarity', excludeCredentialIds: ['BAUG'],
    registration: { binding: 'alice', device: 'iPhone', platform: 'ios', registry },
    passkey: { createCredential: async input => {
      expect(input.excludeCredentialIds).toEqual(['BAUG']);
      return { credentialId: 'AQID', prfOutput: base64UrlEncode(new Uint8Array(32).fill(7)), attestationObject: 'garbage' };
    } },
    pending: { set: (_locator, _record, row) => { pendingMetadata = row; }, clear: () => {} },
    upload: { put: async () => {
      const rows = registry.list('alice', false);
      expect(rows.ok && rows.value).toMatchObject([{ status: 'pending', aaguid: null }]);
      expect(pendingMetadata).toMatchObject({ credentialId: 'AQID', status: 'pending' });
      expect(JSON.stringify([...values])).not.toContain('garbage');
      return { ok: true, value: undefined };
    } },
  });
  expect(result.ok).toBe(true);
  const rows = registry.list('alice', true);
  expect(rows.ok && rows.value).toMatchObject([{ status: 'synced' }]);
});

test('uploads are owned by the seed-derived owner and carry metadata only that identity can open', async () => {
  const { deriveRootVaultAccess, openRootVaultMeta, rootVaultOwnerHash, rootVaultLocator, base64UrlDecode } = await import('@solidarity/shared');
  const values = new Map<string, string>();
  const registry = createPasskeyRegistry({ getString: key => values.get(key), set: (key, value) => { values.set(key, value); } });
  let sent: { owner: string; meta?: string } | undefined;
  const result = await connectRootIdentityToPasskey({
    mnemonic, userName: 'Solidarity',
    registration: { binding: 'alice', device: 'iPhone', platform: 'ios', registry },
    passkey: { createCredential: async () => ({ credentialId: 'AQID', prfOutput: base64UrlEncode(new Uint8Array(32).fill(7)) }) },
    upload: { put: async (_locator, _record, owner) => {
      sent = owner ? { owner: rootVaultOwnerHash(owner.ownerSecret), ...(owner.meta ? { meta: owner.meta } : {}) } : undefined;
      return { ok: true, value: undefined };
    } },
  });
  expect(result.ok).toBe(true);
  const access = deriveRootVaultAccess(mnemonic);
  if (!access.ok) throw new Error('fixture');
  expect(sent?.owner).toBe(rootVaultOwnerHash(access.value.ownerSecret));
  const meta = openRootVaultMeta(sent?.meta ?? '', rootVaultLocator(base64UrlDecode('AQID')), access.value.metaKey);
  expect(meta.ok && meta.value).toMatchObject({ label: 'iPhone', platform: 'ios', credentialId: 'AQID' });
});

test('a retry repeats the first attempt: owned stays owned, pre-index pending stays unowned', async () => {
  const { retryPasskeyUpload } = await import('../../src/identity/rootVaultSync');
  const registry = createPasskeyRegistry({ getString: () => undefined, set: () => {} });
  const record = { v: 1 as const, ciphertext: 'A'.repeat(60) };
  const secret = new Uint8Array(32).fill(1);
  const seen: Array<boolean> = [];
  const upload = { put: async (_l: string, _r: typeof record, owner?: unknown) => { seen.push(owner !== undefined); return { ok: true as const, value: undefined }; } };
  await retryPasskeyUpload({ binding: 'b', locator: 'L', record, owned: true, meta: 'M'.repeat(40) }, upload, registry, secret);
  await retryPasskeyUpload({ binding: 'b', locator: 'L', record }, upload, registry, secret);
  expect(seen).toEqual([true, false]);
});
