/**
 * Every passkey of this identity — app and web — from the creds.id owner
 * index (docs/ref/08 §5). The owner secret and meta key come from the root
 * mnemonic; the service only ever sees their hash and sealed metadata.
 */
import {
  base64UrlEncode,
  deriveRootVaultAccess,
  openRootVaultMeta,
  sealRootVaultMeta,
  type Result,
  type RootVaultAccess,
  type RootVaultMeta,
} from '@solidarity/shared';

import { passkeyProvider } from './passkeyAaguid';
import type { PasskeyRow } from './passkeyRegistry';
import { ROOT_VAULT_ORIGIN, signWithRootKey, type SignCredsRequest } from './rootVaultSync';

export interface IndexedPasskey {
  readonly locator: string;
  readonly createdAt: number;
  /** Registered from this phone (its local registry knows the locator). */
  readonly thisDevice: boolean;
  readonly meta: RootVaultMeta | null;
  readonly provider: string | null;
}

export type PasskeyIndexError =
  | { readonly kind: 'notProvisioned' }
  | { readonly kind: 'networkFailed'; readonly detail?: string }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'invalid' };

interface OwnedRow {
  readonly locator: string;
  readonly meta: string | null;
  readonly createdAt: number;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function isOwnedRow(value: unknown): value is OwnedRow {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row['locator'] === 'string' && typeof row['createdAt'] === 'number'
    && (row['meta'] === null || typeof row['meta'] === 'string');
}

export function createPasskeyIndexClient(
  fetchImpl: FetchLike = fetch,
  origin = ROOT_VAULT_ORIGIN,
  sign: SignCredsRequest = signWithRootKey,
) {
  const auth = (secret: Uint8Array) => ({ authorization: `Bearer ${base64UrlEncode(secret)}`, accept: 'application/json' });
  const send = async (path: string, init: RequestInit): Promise<Result<Response, PasskeyIndexError>> => {
    try {
      return { ok: true, value: await fetchImpl(`${origin}${path}`, init) };
    } catch (error) {
      return { ok: false, error: { kind: 'networkFailed', detail: error instanceof Error ? error.message.slice(0, 200) : undefined } };
    }
  };
  const mutation = async (path: string, init: RequestInit): Promise<Result<void, PasskeyIndexError>> => {
    const response = await send(path, init);
    if (!response.ok) return response;
    if (response.value.ok) return { ok: true, value: undefined };
    return response.value.status === 404
      ? { ok: false, error: { kind: 'notFound' } }
      : { ok: false, error: { kind: 'networkFailed', detail: `HTTP ${response.value.status}` } };
  };
  /** Claim and delete also need the root did's signature for that exact request. */
  const signed = async (method: 'PUT' | 'DELETE', path: string, init: RequestInit): Promise<Result<void, PasskeyIndexError>> => {
    const signature = await sign(method, path);
    if (signature === null) return { ok: false, error: { kind: 'notProvisioned' } };
    return mutation(path, { ...init, method, headers: { ...(init.headers as Record<string, string>), 'x-creds-signature': signature } });
  };
  const withMeta = (secret: Uint8Array, meta: string): RequestInit => ({
    headers: { ...auth(secret), 'content-type': 'application/json' },
    body: JSON.stringify({ meta }),
  });
  return {
    list: async (secret: Uint8Array): Promise<Result<OwnedRow[], PasskeyIndexError>> => {
      const response = await send('/vault/root', { method: 'GET', headers: auth(secret) });
      if (!response.ok) return response;
      if (!response.value.ok) return { ok: false, error: { kind: 'networkFailed', detail: `HTTP ${response.value.status}` } };
      try {
        const body = (await response.value.json()) as { rows?: unknown };
        return Array.isArray(body.rows) && body.rows.every(isOwnedRow)
          ? { ok: true, value: body.rows }
          : { ok: false, error: { kind: 'networkFailed', detail: 'invalid body' } };
      } catch {
        return { ok: false, error: { kind: 'networkFailed', detail: 'invalid body' } };
      }
    },
    rename: (locator: string, meta: string, secret: Uint8Array) =>
      mutation(`/vault/root/${locator}/meta`, { method: 'PATCH', ...withMeta(secret, meta) }),
    claim: (locator: string, meta: string, secret: Uint8Array) =>
      signed('PUT', `/vault/root/${locator}/owner`, withMeta(secret, meta)),
    remove: (locator: string, secret: Uint8Array) =>
      signed('DELETE', `/vault/root/${locator}`, { headers: auth(secret) }),
  };
}

export type PasskeyIndexClient = ReturnType<typeof createPasskeyIndexClient>;

function metaFromRow(row: PasskeyRow): RootVaultMeta | null {
  if (row.platform !== 'ios' && row.platform !== 'android') return null;
  return {
    v: 1,
    label: (passkeyProvider(row.aaguid) ?? row.device).slice(0, 64),
    credentialId: row.credentialId,
    createdAt: row.createdAt,
    platform: row.platform,
    device: row.device.slice(0, 64),
    aaguid: row.aaguid,
  };
}

/**
 * List the owner index. Rows this phone uploaded before the index existed
 * (synced in the local registry, missing from the list) are claimed first,
 * so the list is complete on the first visit after updating.
 */
export async function listIndexedPasskeys(input: {
  readonly access: RootVaultAccess;
  readonly client: PasskeyIndexClient;
  readonly localRows: readonly PasskeyRow[];
}): Promise<Result<IndexedPasskey[], PasskeyIndexError>> {
  let listed = await input.client.list(input.access.ownerSecret);
  if (!listed.ok) return listed;
  const known = new Set(listed.value.map(row => row.locator));
  const unclaimed = input.localRows.filter(row => row.status === 'synced' && !known.has(row.locator));
  if (unclaimed.length > 0) {
    for (const row of unclaimed) {
      const meta = metaFromRow(row);
      const sealed = meta ? sealRootVaultMeta(meta, row.locator, input.access.metaKey) : null;
      if (sealed?.ok) await input.client.claim(row.locator, sealed.value, input.access.ownerSecret);
    }
    listed = await input.client.list(input.access.ownerSecret);
    if (!listed.ok) return listed;
  }
  const local = new Set(input.localRows.map(row => row.locator));
  return {
    ok: true,
    value: listed.value.map(row => {
      const opened = row.meta === null ? null : openRootVaultMeta(row.meta, row.locator, input.access.metaKey);
      const meta = opened?.ok ? opened.value : null;
      return {
        locator: row.locator,
        createdAt: row.createdAt,
        thisDevice: local.has(row.locator),
        meta,
        provider: passkeyProvider(meta?.aaguid ?? null),
      };
    }),
  };
}

export async function renameIndexedPasskey(input: {
  readonly access: RootVaultAccess;
  readonly client: PasskeyIndexClient;
  readonly entry: IndexedPasskey;
  readonly label: string;
}): Promise<Result<void, PasskeyIndexError>> {
  const label = Array.from(input.label.trim()).slice(0, 64).join('');
  if (label === '' || input.entry.meta === null) return { ok: false, error: { kind: 'invalid' } };
  const sealed = sealRootVaultMeta({ ...input.entry.meta, label }, input.entry.locator, input.access.metaKey);
  if (!sealed.ok) return { ok: false, error: { kind: 'invalid' } };
  return input.client.rename(input.entry.locator, sealed.value, input.access.ownerSecret);
}

export async function removeIndexedPasskey(input: {
  readonly access: RootVaultAccess;
  readonly client: PasskeyIndexClient;
  readonly entry: IndexedPasskey;
}): Promise<Result<void, PasskeyIndexError>> {
  return input.client.remove(input.entry.locator, input.access.ownerSecret);
}

/** Owner-index keys for the stored root; callers zero them when done. */
export async function readStoredVaultAccess(): Promise<Result<RootVaultAccess, PasskeyIndexError>> {
  const { readMnemonicForPasskeyConnection } = await import('./rootKey');
  const mnemonic = await readMnemonicForPasskeyConnection();
  if (!mnemonic.ok) return { ok: false, error: { kind: 'notProvisioned' } };
  const access = deriveRootVaultAccess(mnemonic.value);
  return access.ok ? access : { ok: false, error: { kind: 'notProvisioned' } };
}
