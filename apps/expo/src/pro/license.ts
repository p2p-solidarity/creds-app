/**
 * The creds Pro license (docs/ref/09 license bridge, docs/ref/10 §3.11): the
 * store purchase, exchanged at creds.id for a short-lived JWS bound to the
 * root did:key. The app needs it for one thing today — asking the Pro notary
 * to add its witness. Cached in MMKV (it is a bearer credential only for the
 * owner's own Page; the notary witnesses nothing it did not fetch itself).
 */
import { Platform } from 'react-native';
import {
  CREDS_LICENSE_ISSUERS,
  CREDS_NOTARY_ORIGIN,
  err,
  ok,
  signCompact,
  verifyProLicense,
  type Result,
} from '@solidarity/shared';

import { getRootDid, getRootSigner } from '@/identity/rootKey';
import { NIP05_SERVICE_ORIGIN } from '@/nip05/client';
import { getMmkv } from '@/storage/mmkv';

import { connectProStore, PRO_YEARLY_PRODUCT_ID } from './purchases';

const KEY = 'pro:license:v1';
const RENEW_BEFORE_SECONDS = 86_400;

export type LicenseFailure = 'noPurchase' | 'noIdentity' | 'unreachable' | 'refused' | 'invalid';

function cached(did: string, nowSeconds: number): string | null {
  try {
    const jws = getMmkv().getString(KEY);
    if (jws === undefined) return null;
    const r = verifyProLicense(jws, { issuers: CREDS_LICENSE_ISSUERS, nowSeconds: nowSeconds + RENEW_BEFORE_SECONDS, sub: did });
    return r.ok ? jws : null;
  } catch {
    return null;
  }
}

/** A current license for this identity: the cached one, or a fresh one from creds.id. */
export async function ensureProLicense(): Promise<Result<string, LicenseFailure>> {
  const did = await getRootDid();
  if (!did.ok) return err('noIdentity');
  const now = Math.floor(Date.now() / 1000);
  const hit = cached(did.value, now);
  if (hit !== null) return ok(hit);

  const store = await connectProStore();
  if (store === null) return err('unreachable');
  let purchase: string | null = null;
  try {
    for (const p of await store.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true })) {
      if (p.productId !== PRO_YEARLY_PRODUCT_ID) continue;
      const original = 'originalTransactionIdentifierIOS' in p ? p.originalTransactionIdentifierIOS : null;
      purchase = Platform.OS === 'android' ? (p.purchaseToken ?? null) : (original ?? p.id);
      if (purchase !== null) break;
    }
  } catch {
    return err('unreachable');
  }
  if (purchase === null) return err('noPurchase');

  const signer = await getRootSigner();
  if (!signer.ok) return err('noIdentity');
  let request: string;
  try {
    request = await signCompact(
      { did: did.value, platform: Platform.OS === 'android' ? 'android' : 'ios', purchase, aud: 'creds.id/pro/license', iat: now },
      did.value,
      signer.value,
    );
  } catch {
    return err('noIdentity');
  }

  let license: unknown;
  try {
    const res = await fetch(`${NIP05_SERVICE_ORIGIN}/pro/license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request }),
    });
    if (res.status >= 500) return err('unreachable');
    if (!res.ok) return err('refused');
    license = ((await res.json()) as { license?: unknown }).license;
  } catch {
    return err('unreachable');
  }
  if (typeof license !== 'string') return err('invalid');
  if (!verifyProLicense(license, { issuers: CREDS_LICENSE_ISSUERS, nowSeconds: now, sub: did.value }).ok) return err('invalid');
  try {
    getMmkv().set(KEY, license);
  } catch {
    // Not cached: the next request mints another.
  }
  return ok(license);
}

export type NotaryQueueFailure = LicenseFailure | 'notaryRefused';

/** Queue this Page for the Pro notary's next hourly batch (its witness is published, not returned). */
export async function queueNotaryWitness(page: {
  readonly jws: string;
  readonly name: string;
}): Promise<Result<void, NotaryQueueFailure>> {
  const license = await ensureProLicense();
  if (!license.ok) return license;
  try {
    const res = await fetch(`${CREDS_NOTARY_ORIGIN}/v1/witness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: page.jws, license: license.value, name: page.name }),
    });
    return res.status === 202 ? ok(undefined) : err(res.status >= 500 ? 'unreachable' : 'notaryRefused');
  } catch {
    return err('unreachable');
  }
}
