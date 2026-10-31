/**
 * Production wiring for `runAccountDeletion`: each step talks to the real
 * creds.id service (or the relays) with the key it needs from this device.
 *
 * The caller has already passed the ONE red-line Face ID gate. Nothing here
 * prompts again: the Nostr key signs ungated (publish is the consent, see
 * `userKey.ts`), the owner secret is a derived bearer, and the Pro request is
 * every creds.id delete is signed by `signRootRequest`, which signs only
 * vault and Pro-binding requests.
 */
import { ed25519 } from '@noble/curves/ed25519.js';
import * as SecureStore from 'expo-secure-store';
import { base64Decode, base64Encode, base64UrlEncode, buildNip98Authorization, utf8ToBytes } from '@solidarity/shared';

import { createPasskeyIndexClient, listIndexedPasskeys, readStoredVaultAccess } from '@/identity/passkeyIndex';
import { getPasskeyRegistry, type PasskeyRow } from '@/identity/passkeyRegistry';
import { hasRootKey, signRootRequest } from '@/identity/rootKey';
import { getStoredRootVaultIdentityBinding } from '@/identity/rootVaultSync';
import { NIP05_SERVICE_ORIGIN } from '@/nip05/client';
import { publishEvent, subscribeEvents } from '@/nostr/nostrAdapter';
import { DEFAULT_RELAYS, publishToRelays } from '@/nostr/publish';
import { getNostrPubkey, hasNostrKey, signNostrEvent } from '@/nostr/userKey';
import { wipeLocalDevice } from '@/settings/productionWipe';

import {
  runAccountDeletion,
  type AccountDeletionResult,
  type StepRunResult,
} from './accountDeletion';
import { eraseNostrFootprint } from './nostrErasure';

const DONE: StepRunResult = { kind: 'done' };
const NOTHING: StepRunResult = { kind: 'nothing' };
const FAILED: StepRunResult = { kind: 'failed' };
const REQUEST_TIMEOUT_MS = 15_000;

/** The retired Shoutouts relay (inbox worker, its own Cloudflare account). */
const LEGACY_INBOX_ORIGIN = 'https://airmeishi-backend.kidneyweakx.workers.dev';
const LEGACY_INBOX_SIGNING_KEY_ALIAS = 'gg.solidarity.sakura.sig.ed25519.v1';

async function send(url: string, init: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function eraseNostr(): Promise<StepRunResult> {
  if (!(await hasNostrKey())) return NOTHING;
  const result = await eraseNostrFootprint({
    relays: DEFAULT_RELAYS,
    getPubkey: getNostrPubkey,
    sign: signNostrEvent,
    subscribe: subscribeEvents,
    publish: (event, relays) => publishToRelays(event, relays, publishEvent),
  });
  return result.ok ? DONE : FAILED;
}

/** Every name this Nostr key held becomes an unlinked, still-reserved tombstone. */
async function eraseName(): Promise<StepRunResult> {
  if (!(await hasNostrKey())) return NOTHING;
  const url = `${NIP05_SERVICE_ORIGIN}/id/account`;
  const authorization = await buildNip98Authorization(url, 'DELETE', null, signNostrEvent);
  if (!authorization.ok) return FAILED;
  const response = await send(url, {
    method: 'DELETE',
    headers: { accept: 'application/json', authorization: authorization.value },
  });
  return response?.ok === true ? DONE : FAILED;
}

function localPasskeyRows(binding: string | null): PasskeyRow[] {
  if (binding === null) return [];
  const listed = getPasskeyRegistry().list(binding, false);
  return listed.ok ? listed.value.filter((row): row is PasskeyRow => !('legacy' in row)) : [];
}

/** Every root-vault row in the owner index — app and web passkeys alike. */
async function deleteVaults(): Promise<StepRunResult> {
  if (!(await hasRootKey())) return NOTHING;
  const access = await readStoredVaultAccess();
  if (!access.ok) return FAILED;
  try {
    const client = createPasskeyIndexClient();
    const listed = await listIndexedPasskeys({
      access: access.value,
      client,
      localRows: localPasskeyRows(await getStoredRootVaultIdentityBinding()),
    });
    if (!listed.ok) return FAILED;
    for (const entry of listed.value) {
      const removed = await client.remove(entry.locator, access.value.ownerSecret);
      if (!removed.ok && removed.error.kind !== 'notFound') return FAILED;
    }
    const left = await client.list(access.value.ownerSecret);
    return left.ok && left.value.length === 0 ? DONE : FAILED;
  } finally {
    access.value.ownerSecret.fill(0);
    access.value.metaKey.fill(0);
  }
}

async function deleteProBinding(): Promise<StepRunResult> {
  if (!(await hasRootKey())) return NOTHING;
  const signature = await signRootRequest('DELETE', '/pro/binding');
  if (!signature.ok) return FAILED;
  const response = await send(`${NIP05_SERVICE_ORIGIN}/pro/binding`, {
    method: 'DELETE',
    headers: { 'x-creds-signature': signature.value },
  });
  return response?.ok === true ? DONE : FAILED;
}

/** Only a device that once ran Shoutouts holds the key its inbox rows are under. */
async function purgeLegacyInbox(): Promise<StepRunResult> {
  let stored: string | null;
  try {
    stored = await SecureStore.getItemAsync(LEGACY_INBOX_SIGNING_KEY_ALIAS, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    });
  } catch {
    return FAILED;
  }
  if (stored === null) return NOTHING;
  const secret = base64Decode(stored);
  try {
    const pubkey = base64Encode(ed25519.getPublicKey(secret));
    const ts = Math.floor(Date.now() / 1000);
    const nonce = base64UrlEncode(crypto.getRandomValues(new Uint8Array(18)));
    const sig = base64Encode(ed25519.sign(utf8ToBytes(`creds-inbox-delete:${pubkey}:${ts}:${nonce}`), secret));
    const response = await send(`${LEGACY_INBOX_ORIGIN}/inbox/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pubkey, ts, nonce, sig }),
    });
    return response?.ok === true ? DONE : FAILED;
  } finally {
    secret.fill(0);
  }
}

async function wipeLocal(): Promise<StepRunResult> {
  const result = await wipeLocalDevice();
  return result.kind === 'ok' ? DONE : FAILED;
}

export function deleteAccountEverywhere(
  onProgress?: Parameters<typeof runAccountDeletion>[1],
): Promise<AccountDeletionResult> {
  return runAccountDeletion(
    {
      nostr: eraseNostr,
      name: eraseName,
      vault: deleteVaults,
      pro: deleteProBinding,
      inbox: purgeLegacyInbox,
      local: wipeLocal,
    },
    onProgress,
  );
}
