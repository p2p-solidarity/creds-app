/**
 * zkTLS verification engine (docs/ref/10 §2 step ③, §3.5): proves a bio
 * carries `creds.id/@name`, plus the name → npub link, through the creds.id
 * notary, and checks the whole chain locally with the same shared verifier a
 * viewer runs — the UI only ever sees a proof that already verifies.
 *
 * Each notary call is NIP-98 signed with the npub key (no Face ID), so this
 * runs unattended for the 30-day renewal too. Pieces run in parallel where
 * they can: the platform page and the name evidence together. X is proven
 * from the profile payload x.com embeds (bio links and the website field,
 * already expanded — §3.10); only if that payload is gone does it fall back
 * to the bio meta plus its t.co hops.
 */
import { getZktls } from '@solidarity/nitro-attest';
import {
  CREDS_NOTARY_ORIGIN,
  CREDS_NOTARY_ROOTS,
  buildNip98Authorization,
  bytesToHex,
  err,
  notaryEvidenceUrl,
  notarySessionUrl,
  ok,
  profileTarget,
  verifyNotaryBundle,
  verifySocialProof,
  ZKTLS_PLATFORMS,
  type NotaryBundle,
  type Result,
  type SocialProof,
  type SocialTarget,
  type ZktlsPlatform,
} from '@solidarity/shared';

import { getNostrPubkey, npubEncode, signNostrEvent } from '@/nostr/userKey';

export type ProofFailure =
  /** This build has no prover (Android today, or an iOS build without the library). */
  | 'unavailable'
  /** No Nostr key on this device yet — nothing to bind the evidence to. */
  | 'noNostrKey'
  /** The notary refused or could not be reached. */
  | 'notary'
  /** The platform says this handle does not exist. */
  | 'notFound'
  /** The platform blocked the fetch (status 403/429, login wall, changed markup). */
  | 'blocked'
  /** The page was proven but the bio does not carry the marker (yet). */
  | 'markerMissing'
  | 'failed';

/** X turns every bio URL into a t.co link; follow at most this many. */
const MAX_TCO_HOPS = 3;
const TCO_RE = /(?:^|[^a-z0-9.-])t\.co\/([A-Za-z0-9]{6,15})(?![A-Za-z0-9])/giu;

interface ProverResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly detail?: string;
}

/** The prover's error code → what the owner can act on. */
function proverFailure(result: ProverResult): ProofFailure {
  switch (result.error) {
    case 'unavailable':
    case 'notary':
      return result.error;
    case 'status':
      return result.detail === '404' ? 'notFound' : 'blocked';
    case 'fieldMissing':
      return 'blocked';
    default:
      return 'failed';
  }
}

function randomSid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function nip98(url: string): Promise<Result<string, ProofFailure>> {
  const header = await buildNip98Authorization(url, 'GET', null, signNostrEvent);
  return header.ok ? ok(header.value) : err('noNostrKey');
}

/** One notary-witnessed page: prove on device, then pick the signed evidence up. */
async function witness(
  platform: ZktlsPlatform,
  handle: string,
  name: string,
  fieldContains?: string,
): Promise<Result<NotaryBundle, ProofFailure>> {
  const prover = getZktls();
  if (!prover?.isAvailable) return err('unavailable');
  const target = profileTarget(platform, handle);
  const field = ZKTLS_PLATFORMS[platform].field?.(handle);
  if (!target.ok || field === undefined) return err('failed');

  const sid = randomSid();
  const sessionUrl = notarySessionUrl(CREDS_NOTARY_ORIGIN, { platform, handle, name, sid });
  const sessionAuth = await nip98(sessionUrl);
  if (!sessionAuth.ok) return sessionAuth;

  let proved: ProverResult;
  try {
    proved = JSON.parse(
      await prover.prove(
        JSON.stringify({
          notaryUrl: sessionUrl.replace(/^https:/u, 'wss:'),
          authorization: sessionAuth.value,
          host: target.value.server,
          path: target.value.request.split(' ')[1],
          fieldStart: field.start,
          fieldStop: field.stop,
          fieldStopUnescaped: field.stopUnescaped === true,
          ...(fieldContains === undefined ? {} : { fieldContains }),
        }),
      ),
    ) as ProverResult;
  } catch {
    return err('failed');
  }
  if (!proved.ok) return err(proverFailure(proved));

  const evidenceUrl = notaryEvidenceUrl(CREDS_NOTARY_ORIGIN, sid);
  const evidenceAuth = await nip98(evidenceUrl);
  if (!evidenceAuth.ok) return evidenceAuth;
  try {
    const res = await fetch(evidenceUrl, { headers: { Authorization: evidenceAuth.value } });
    if (!res.ok) return err('notary');
    const body = (await res.json()) as Partial<NotaryBundle>;
    if (typeof body.cert !== 'string' || typeof body.evidence !== 'string') return err('notary');
    return ok({ cert: body.cert, evidence: body.evidence });
  } catch {
    return err('notary');
  }
}

/** The bio value a witnessed profile revealed (for finding X's t.co links). */
function revealedBio(bundle: NotaryBundle): string | null {
  const verified = verifyNotaryBundle(bundle, { roots: CREDS_NOTARY_ROOTS });
  return verified.ok ? verified.value.revealedValue : null;
}

export async function currentNpub(): Promise<Result<string, ProofFailure>> {
  const pubkey = await getNostrPubkey();
  if (!pubkey.ok) return err('noNostrKey');
  const npub = npubEncode(pubkey.value);
  return npub.ok ? ok(npub.value) : err('noNostrKey');
}

/** Run one full proof for `target` and return it only if the chain verifies end to end. */
export async function proveSocialTarget(target: SocialTarget, name: string): Promise<Result<SocialProof, ProofFailure>> {
  const npub = await currentNpub();
  if (!npub.ok) return npub;

  const [first, nameEvidence] = await Promise.all([
    target.platform === 'x'
      ? witness('x-profile', target.handle, name, `creds.id/@${name}`)
      : witness(target.platform, target.handle, name),
    witness('creds-name', name, name),
  ]);
  if (!nameEvidence.ok) return nameEvidence;
  // No embedded profile holding the marker (X changed the page, or the marker is missing):
  // the bio meta + t.co route below still proves a bio marker, or reports it missing.
  const viaBio = target.platform === 'x' && !first.ok && first.error === 'blocked';
  const profile = viaBio ? await witness('x', target.handle, name) : first;
  if (!profile.ok) return profile;

  const links: NotaryBundle[] = [];
  if (viaBio) {
    const bio = revealedBio(profile.value) ?? '';
    const ids = [...new Set([...bio.matchAll(TCO_RE)].map((m) => m[1] ?? '').filter((id) => id !== ''))].slice(0, MAX_TCO_HOPS);
    if (ids.length === 0) return err('markerMissing');
    const hops = await Promise.all(ids.map((id) => witness('x-link', id, name)));
    for (const hop of hops) if (hop.ok) links.push(hop.value);
    if (links.length === 0) return hops.find((h) => !h.ok) ?? err('failed');
  }

  const proof: SocialProof = {
    v: 1,
    platform: target.platform,
    handle: target.handle,
    name,
    profile: profile.value,
    links,
    nameEvidence: nameEvidence.value,
  };
  const verified = verifySocialProof(proof, npub.value, { roots: CREDS_NOTARY_ROOTS });
  if (!verified.ok) return err(verified.error.includes('marker') ? 'markerMissing' : 'failed');
  return ok(proof);
}
