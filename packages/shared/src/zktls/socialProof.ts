/**
 * Social proof — the evidence chain from a platform bio to a Page
 * (docs/ref/10 §3.5). Every link is a notary-witnessed fact checked offline:
 *
 *   profile      "x.com/alice's bio contains t.co/AbC" (Telegram/GitHub: the marker itself)
 *   links        "t.co/AbC's page title is creds.id/@name" (X only — X rewrites every bio URL)
 *   nameEvidence "creds.id says name → this npub"
 *   Page         root-signed, claims `nostr:<that npub>` and `x:@alice`
 *
 * All evidence must be requested by the same npub the Page claims (NIP-98
 * binds each session to it) and witnessed within one proof run, so pieces
 * of different people's proofs can't be spliced together.
 */
import { npubToHex } from '../nostr/npub';
import { err, ok, type Result } from '../types/result';
import { verifyNotaryBundle, type NotaryBundle, type VerifiedEvidence } from './evidence';
import { bioCarriesMarker, ZKTLS_PLATFORMS, type ZktlsPlatform } from './platforms';
import { isMarkerUrl, parseXProfile } from './xProfile';

/** Platforms a Page can carry a zkTLS claim for (the others are proof plumbing). */
export type ZktlsSocialPlatform = Extract<ZktlsPlatform, 'x' | 'telegram' | 'github' | 'website'>;
export const ZKTLS_SOCIAL_PLATFORMS: readonly ZktlsSocialPlatform[] = ['x', 'telegram', 'github', 'website'];

/** One proof run's pieces may span at most this long. */
const MAX_RUN_SECONDS = 600;

export interface SocialProof {
  readonly v: 1;
  readonly platform: ZktlsSocialPlatform;
  readonly handle: string;
  /** The creds.id name whose marker the bio carries. */
  readonly name: string;
  readonly profile: NotaryBundle;
  readonly links: readonly NotaryBundle[];
  readonly nameEvidence: NotaryBundle;
}

export interface VerifiedSocialProof {
  readonly platform: ZktlsSocialPlatform;
  readonly handle: string;
  readonly name: string;
  readonly npub: string;
  /** When the oldest piece was witnessed (unix seconds) — the badge's age. */
  readonly verifiedAt: number;
  readonly notaryKey: string;
}

export interface SocialProofOptions {
  readonly roots: readonly string[];
  readonly revoked?: ReadonlySet<string>;
}

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

/** `t.co/<id>` as a whole token in an X bio. */
function bioLinksTco(bio: string, id: string): boolean {
  const needle = `t.co/${id}`;
  for (let at = bio.indexOf(needle); at >= 0; at = bio.indexOf(needle, at + 1)) {
    const before = at === 0 ? '' : bio.charAt(at - 1);
    const after = bio.charAt(at + needle.length);
    if (!/[a-z0-9.-]/iu.test(before) && !/[a-z0-9]/iu.test(after)) return true;
  }
  return false;
}

function markerReached(proof: SocialProof, profile: VerifiedEvidence, links: readonly VerifiedEvidence[]): boolean {
  switch (proof.platform) {
    case 'website':
      return profile.revealedValue === `creds.id/@${proof.name}`;
    case 'telegram':
    case 'github':
      return bioCarriesMarker(profile.revealedValue, proof.name);
    case 'x': {
      if (profile.platform === 'x-profile') {
        const urls = parseXProfile(profile.revealedValue, proof.handle);
        return urls.ok && urls.value.some((u) => isMarkerUrl(u, proof.name));
      }
      return links.some(
        (l) =>
          l.platform === 'x-link' &&
          bioLinksTco(profile.revealedValue, l.handle) &&
          bioCarriesMarker(l.revealedValue, proof.name),
      );
    }
  }
}

export function verifySocialProof(
  proof: SocialProof,
  npub: string,
  opts: SocialProofOptions,
): Result<VerifiedSocialProof, string> {
  const pubkey = npubToHex(npub);
  if (!pubkey.ok) return err('invalid npub');

  const profile = verifyNotaryBundle(proof.profile, opts);
  if (!profile.ok) return err(`profile: ${profile.error}`);
  const name = verifyNotaryBundle(proof.nameEvidence, opts);
  if (!name.ok) return err(`name: ${name.error}`);
  const links: VerifiedEvidence[] = [];
  for (const bundle of proof.links) {
    const link = verifyNotaryBundle(bundle, opts);
    if (!link.ok) return err(`link: ${link.error}`);
    links.push(link.value);
  }
  const all = [profile.value, name.value, ...links];

  // An X claim is proven by the bio meta (+ t.co hops) or by the embedded profile payload.
  const profilePlatformOk =
    profile.value.platform === proof.platform || (proof.platform === 'x' && profile.value.platform === 'x-profile');
  if (!profilePlatformOk || profile.value.handle !== proof.handle) {
    return err('profile evidence is for another handle');
  }
  if (name.value.platform !== 'creds-name' || name.value.handle !== proof.name) {
    return err('name evidence is for another name');
  }
  if (name.value.revealedValue !== pubkey.value) return err('name belongs to another npub');
  if (all.some((e) => e.npub !== npub)) return err('evidence was requested by another npub');
  const times = all.map((e) => e.iat);
  if (Math.max(...times) - Math.min(...times) > MAX_RUN_SECONDS) return err('evidence spans more than one proof run');
  if (!markerReached(proof, profile.value, links)) return err('the bio does not carry this name’s marker');

  return ok({
    platform: proof.platform,
    handle: proof.handle,
    name: proof.name,
    npub,
    verifiedAt: Math.min(...times),
    notaryKey: profile.value.notaryKey,
  });
}

/**
 * The full chain for a viewer: the Page (already root-signature-checked by
 * the caller) claims the handle and the npub the evidence is bound to.
 */
export function verifyPageSocialProof(
  page: { readonly alsoKnownAs: readonly string[] },
  proof: SocialProof,
  opts: SocialProofOptions,
): Result<VerifiedSocialProof, string> {
  if (!page.alsoKnownAs.includes(pageSocialClaim(proof.platform, proof.handle))) {
    return err('the Page does not claim this handle');
  }
  const npubs = page.alsoKnownAs.filter((a) => a.startsWith('nostr:npub1')).map((a) => a.slice('nostr:'.length));
  let last: Result<VerifiedSocialProof, string> = err('the Page claims no npub');
  for (const npub of npubs) {
    last = verifySocialProof(proof, npub, opts);
    if (last.ok) return last;
  }
  return last;
}
