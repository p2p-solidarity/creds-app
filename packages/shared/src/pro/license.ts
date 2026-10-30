/**
 * creds Pro license (docs/ref/09 license bridge, docs/ref/10 §3.11): a
 * short-lived JWS the creds.id worker signs after it verified a store
 * purchase, bound to the buyer's root did:key. The Pro notary and the app
 * accept it offline against the pinned issuer key; nothing else is trusted.
 *
 * Licenses live at most 7 days (and never past the store expiry), so a
 * purchase rebound to another did stops renewing the old one within a week —
 * no revocation list needed.
 */
import { z } from 'zod';

import { base64UrlDecode, bytesToUtf8 } from '../crypto';
import { verifyCompact } from '../jws';
import { err, ok, type Result } from '../types/result';

export const LICENSE_TYP = 'creds.pro.license/v1';
export const LICENSE_MAX_SECONDS = 7 * 86_400;
const SKEW_SECONDS = 300;

/**
 * did:key(s) of the creds.id license signing key (solidarity-id Worker
 * secret `LICENSE_SIGNING_KEY`, made by
 * `airmeishi-backend/scripts/license-key.ts`, provisioned 2026-10-30).
 * A license from any other key fails closed.
 */
export const CREDS_LICENSE_ISSUERS: readonly string[] = ['did:key:zDnaes2SfS91nr5v4Dz4fwExpjL3BSpzUTsDFpyJpXhJ1uLBN'];

const licenseSchema = z
  .object({
    typ: z.literal(LICENSE_TYP),
    sub: z.string().startsWith('did:key:'),
    product: z.string().min(1).max(100),
    iat: z.number().int(),
    exp: z.number().int(),
  })
  .strict();
export type ProLicense = z.infer<typeof licenseSchema>;

/** The did in a compact JWS header's `kid` (`<did>#0`), unverified. */
function headerDid(jws: string): string | null {
  try {
    const header: unknown = JSON.parse(bytesToUtf8(base64UrlDecode(jws.split('.')[0] ?? '')));
    const kid = (header as { kid?: unknown }).kid;
    return typeof kid === 'string' && kid.endsWith('#0') ? kid.slice(0, -2) : null;
  } catch {
    return null;
  }
}

export function verifyProLicense(
  jws: string,
  opts: { readonly issuers: readonly string[]; readonly nowSeconds: number; readonly sub?: string },
): Result<ProLicense, string> {
  const issuer = headerDid(jws);
  if (issuer === null || !opts.issuers.includes(issuer)) return err('license is not signed by a creds.id key');
  const payload = verifyCompact(jws, issuer);
  if (!payload.ok) return payload;
  const parsed = licenseSchema.safeParse(payload.value);
  if (!parsed.success) return err('malformed license');
  const l = parsed.data;
  if (l.exp - l.iat > LICENSE_MAX_SECONDS) return err('license lifetime is too long');
  if (opts.nowSeconds < l.iat - SKEW_SECONDS || opts.nowSeconds >= l.exp) return err('license is not current');
  if (opts.sub !== undefined && l.sub !== opts.sub) return err('license is for another identity');
  return ok(l);
}

/** When a license minted now may expire: within 7 days and never after the store says. */
export function licenseExpiry(nowSeconds: number, storeExpirySeconds: number): number {
  return Math.min(nowSeconds + LICENSE_MAX_SECONDS, storeExpirySeconds);
}
