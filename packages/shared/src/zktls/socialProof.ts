/**
 * Link claims a Page can carry (docs/ref/10 §3.5, §3.11): `x:@alice`,
 * `telegram:@…`, `github:@…`, `website:<host>` in the root-signed
 * `alsoKnownAs`. Phones (and the Pro notary) witness them with the platform
 * rules in `platforms.ts`; the witnesses themselves live in `deviceproof/`.
 */
import { ZKTLS_PLATFORMS, type ZktlsPlatform } from './platforms';

/** Platforms a Page can carry a link claim for (the others are page-check plumbing). */
export type ZktlsSocialPlatform = Extract<ZktlsPlatform, 'x' | 'telegram' | 'github' | 'website'>;
export const ZKTLS_SOCIAL_PLATFORMS: readonly ZktlsSocialPlatform[] = ['x', 'telegram', 'github', 'website'];

/** The `alsoKnownAs` entry a Page signs for a verified handle. */
export function pageSocialClaim(platform: ZktlsSocialPlatform, handle: string): string {
  return platform === 'website' ? `website:${handle}` : `${platform}:@${handle}`;
}

/** The inverse of `pageSocialClaim`: `x:@alice` → the target, or null. */
export function socialTargetForClaim(claim: string): { readonly platform: ZktlsSocialPlatform; readonly handle: string } | null {
  const m = /^(x|telegram|github):@(.+)$|^website:(.+)$/u.exec(claim);
  if (m === null) return null;
  const platform: ZktlsSocialPlatform = m[3] !== undefined ? 'website' : (m[1] as ZktlsSocialPlatform);
  const handle = m[3] ?? m[2] ?? '';
  return ZKTLS_PLATFORMS[platform].handlePattern.test(handle) ? { platform, handle } : null;
}
