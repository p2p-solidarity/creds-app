/**
 * zkTLS evidence (docs/ref/10 §3.1, §3.6, §8 Q2) — the stable, long-lived
 * record a notary signs after witnessing a TLS session. TLSNotary itself only
 * lives for the session; what outlives it is this JWS.
 *
 * Two-tier keys: an offline root did:key certifies a monthly did:key for a
 * time window (`cert`), and the monthly key signs the evidence. Both are the
 * repo's one ES256 compact-JWS primitive (`jws.ts`), so a verifier needs only
 * the pinned root DIDs — no network, no TLSNotary code, no creds.id.
 *
 * Verification is fail-closed: an untrusted root, a key outside its window, a
 * revoked key, a cert passed as evidence, or facts outside the platform rule
 * (wrong host, other handle, bytes not anchored on the owner's field) all
 * return `err`.
 */
import { z } from 'zod';

import { decodeJwtUnsafe } from '../identity/jwt';
import { signCompact, verifyCompact, type Signer } from '../jws';
import { npubToHex } from '../nostr/npub';
import { err, ok, type Result } from '../types/result';
import { profileTarget, ZKTLS_PLATFORMS, type ZktlsPlatform } from './platforms';
import { parseXProfile } from './xProfile';

export const EVIDENCE_TYP = 'creds.zktls.evidence/v1';
export const NOTARY_CERT_TYP = 'creds.notary.cert/v1';

const platformSchema = z.enum(['x', 'x-link', 'x-profile', 'telegram', 'github', 'website', 'creds-name']);

const evidenceSchema = z
  .object({
    typ: z.literal(EVIDENCE_TYP),
    platform: platformSchema,
    handle: z.string(),
    server: z.string(),
    request: z.string(),
    revealed: z.string().max(8192),
    npub: z.string(),
    iat: z.number().int().positive(),
    tlsn: z.string().max(64),
  })
  .strict();
export type EvidencePayload = z.infer<typeof evidenceSchema>;

const certSchema = z
  .object({
    typ: z.literal(NOTARY_CERT_TYP),
    did: z.string().startsWith('did:key:'),
    nbf: z.number().int().positive(),
    exp: z.number().int().positive(),
  })
  .strict();
export type NotaryCert = z.infer<typeof certSchema>;

export interface NotaryBundle {
  readonly evidence: string;
  readonly cert: string;
}

export interface VerifiedEvidence {
  readonly platform: ZktlsPlatform;
  readonly handle: string;
  /** The owner-controlled field value (bio, link, title…) without the anchoring markup. */
  readonly revealedValue: string;
  readonly npub: string;
  readonly iat: number;
  readonly notaryKey: string;
  readonly notaryRoot: string;
}

export interface EvidenceFacts {
  readonly platform: ZktlsPlatform;
  readonly handle: string;
  readonly server: string;
  readonly request: string;
  readonly revealed: string;
}

/**
 * Does a witnessed session fall inside its platform rule? The notary runs
 * this before signing and verifiers run it again after; returns the
 * owner-controlled value on success.
 */
export function checkEvidenceFacts(facts: EvidenceFacts): Result<string, string> {
  const target = profileTarget(facts.platform, facts.handle);
  if (!target.ok) return target;
  if (facts.server !== target.value.server) return err('server is not the platform host');
  if (facts.request !== target.value.request) return err('request is not the profile page of the claimed handle');
  const rule = ZKTLS_PLATFORMS[facts.platform];
  if (rule.field === null) {
    return /^creds\.id\/@[a-z0-9]{3,30}$/u.test(facts.revealed)
      ? ok(facts.revealed)
      : err('website evidence must reveal the marker alone');
  }
  const { start, stop } = rule.field(facts.handle);
  if (!facts.revealed.startsWith(start)) return err('revealed bytes are not anchored on the owner field');
  if (facts.platform === 'x-profile') {
    // The anchor is part of the payload: the value is all of it, parsed whole.
    const links = parseXProfile(facts.revealed, facts.handle);
    return links.ok ? ok(facts.revealed) : links;
  }
  const value = facts.revealed.slice(start.length);
  if (value.includes(stop)) return err('revealed bytes run past the owner field');
  return ok(value);
}

export async function signNotaryCert(
  input: { readonly keyDid: string; readonly nbf: number; readonly exp: number },
  rootDid: string,
  sign: Signer,
): Promise<string> {
  const cert: NotaryCert = { typ: NOTARY_CERT_TYP, did: input.keyDid, nbf: input.nbf, exp: input.exp };
  return signCompact(cert, rootDid, sign);
}

export async function signEvidence(payload: EvidencePayload, keyDid: string, sign: Signer): Promise<string> {
  return signCompact(payload, keyDid, sign);
}

function signerDid(jws: string): Result<string, string> {
  try {
    const { header } = decodeJwtUnsafe(jws);
    const kid = (header as { kid?: unknown }).kid;
    if (typeof kid !== 'string' || !kid.endsWith('#0')) return err('missing kid');
    return ok(kid.slice(0, -2));
  } catch {
    return err('malformed JWS');
  }
}

export function verifyNotaryBundle(
  bundle: NotaryBundle,
  opts: { readonly roots: readonly string[]; readonly revoked?: ReadonlySet<string> },
): Result<VerifiedEvidence, string> {
  const root = signerDid(bundle.cert);
  if (!root.ok) return err(`cert: ${root.error}`);
  if (!opts.roots.includes(root.value)) return err('cert is not from a trusted notary root');
  const certJson = verifyCompact(bundle.cert, root.value);
  if (!certJson.ok) return err(`cert: ${certJson.error}`);
  const cert = certSchema.safeParse(certJson.value);
  if (!cert.success) return err('cert: invalid payload');
  if (opts.revoked?.has(cert.data.did)) return err('notary key is revoked');

  const evidenceJson = verifyCompact(bundle.evidence, cert.data.did);
  if (!evidenceJson.ok) return err(`evidence: ${evidenceJson.error}`);
  const evidence = evidenceSchema.safeParse(evidenceJson.value);
  if (!evidence.success) return err('evidence: invalid payload');
  const e = evidence.data;
  if (e.iat < cert.data.nbf || e.iat > cert.data.exp) return err('evidence is outside the notary key window');
  if (!npubToHex(e.npub).ok) return err('evidence: invalid npub');

  const value = checkEvidenceFacts(e);
  if (!value.ok) return value;
  return ok({
    platform: e.platform,
    handle: e.handle,
    revealedValue: value.value,
    npub: e.npub,
    iat: e.iat,
    notaryKey: cert.data.did,
    notaryRoot: root.value,
  });
}
