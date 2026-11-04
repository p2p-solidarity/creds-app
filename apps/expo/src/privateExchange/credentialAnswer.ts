/**
 * The requester's check of a private credential answer (docs/ref/16 §12.1).
 * Fixed order; any failure drops the answer:
 *   1. the VP's `iat` falls inside the request window (not "near now": the
 *      answer waits on relays until the requester opens the app);
 *   2. the VP verifies as of that time — holder signature, `aud`, every
 *      embedded VC's issuer signature and holder binding (`verifyVpToken`);
 *   3. the nonce is this request's;
 *   4. the sender's root DID (from their verified Page) signed a
 *      cardKeyBinding for the VP's holder key, this requester and request.
 * Issuers are shown as they are: "self" when the presenter issued it to
 * themselves, otherwise "unknown" — only did:key issuers verify at all.
 */
import { decodeJwtUnsafe, err, ok, verifyCardKeyBinding, type Result } from '@solidarity/shared';

import { verifyVpToken, type VerifiedVc } from '@/oidc/proofVerifier';

const SKEW_SECONDS = 300;
const MAX_FIELDS = 20;
const MAX_VALUE_CHARS = 200;
/** JWT / SD-JWT / VC envelope keys — not something the holder disclosed about themselves. */
const RESERVED = new Set(['iss', 'sub', 'aud', 'iat', 'nbf', 'exp', 'jti', 'cnf', 'vc', 'vct', 'status', 'nonce', '_sd', '_sd_alg', 'trustLevel']);

export interface CredentialAnswerContext {
  /** The sender's root DID, from the Page their npub is bound to. */
  readonly senderRootDid: string;
  /** `nostr:<my npub>` — the audience the VP and binding must name. */
  readonly aud: string;
  readonly nonce: string;
  readonly requestSentAt: number;
  readonly requestExp: number;
  readonly nowSeconds: number;
}

export interface PresentedField {
  readonly name: string;
  readonly value: string;
}

export interface PresentedCredentialView {
  readonly issuerDid: string;
  readonly type: string;
  /** "self": issued by the presenter to themselves — proves nothing about them. */
  readonly issuer: 'self' | 'unknown';
  readonly fields: readonly PresentedField[];
}

export interface VerifiedCredentialAnswer {
  readonly cardDid: string;
  readonly credentials: readonly PresentedCredentialView[];
  /** Unix s, the VP's own `iat`. */
  readonly presentedAt: number;
}

export type CredentialAnswerRejection = 'malformed' | 'notCurrent' | 'vpRejected' | 'nonceMismatch' | 'bindingRejected';

type Plain = string | number | boolean;
const isPlain = (v: unknown): v is Plain => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

/** Plain values and lists of them; nested objects are machine data, not something to read. */
function display(value: unknown): string | null {
  const text = isPlain(value)
    ? String(value)
    : Array.isArray(value) && value.length > 0 && value.every(isPlain)
      ? value.join(', ')
      : null;
  if (text === null || text === '') return null;
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text;
}

function typeOf(claims: Record<string, unknown>): string {
  const vc = claims['vc'] as { readonly type?: unknown } | undefined;
  const types = Array.isArray(vc?.type) ? (vc.type as unknown[]) : [];
  const named = types.find((t): t is string => typeof t === 'string' && t !== 'VerifiableCredential');
  if (named !== undefined) return named;
  return typeof claims['vct'] === 'string' ? claims['vct'] : 'VerifiableCredential';
}

function fieldsOf(claims: Record<string, unknown>): readonly PresentedField[] {
  const vc = claims['vc'] as { readonly credentialSubject?: Record<string, unknown> } | undefined;
  const subject = vc?.credentialSubject;
  const source = subject !== undefined && typeof subject === 'object' ? subject : claims;
  const out: PresentedField[] = [];
  for (const [name, value] of Object.entries(source)) {
    if (name === 'id' || name.startsWith('@') || RESERVED.has(name)) continue;
    const text = display(value);
    if (text !== null) out.push({ name, value: text });
    if (out.length === MAX_FIELDS) break;
  }
  return out;
}

function view(vc: VerifiedVc, cardDid: string, rootDid: string): PresentedCredentialView {
  return {
    issuerDid: vc.issuerDid,
    type: typeOf(vc.claims),
    issuer: vc.issuerDid === cardDid || vc.issuerDid === rootDid ? 'self' : 'unknown',
    fields: fieldsOf(vc.claims),
  };
}

export async function verifyCredentialAnswer(
  wire: { readonly vp: string; readonly binding: string },
  ctx: CredentialAnswerContext
): Promise<Result<VerifiedCredentialAnswer, CredentialAnswerRejection>> {
  let iat: unknown;
  try {
    iat = decodeJwtUnsafe<{ readonly iat?: unknown }>(wire.vp).payload.iat;
  } catch {
    return err('malformed');
  }
  if (typeof iat !== 'number' || !Number.isSafeInteger(iat)) return err('malformed');
  const notBefore = ctx.requestSentAt - SKEW_SECONDS;
  const notAfter = Math.min(ctx.requestExp, ctx.nowSeconds) + SKEW_SECONDS;
  if (iat < notBefore || iat > notAfter) return err('notCurrent');

  let verified: Awaited<ReturnType<typeof verifyVpToken>>;
  try {
    verified = await verifyVpToken(wire.vp, { expectedAud: ctx.aud, now: iat });
  } catch {
    return err('vpRejected');
  }
  if (verified.nonce !== ctx.nonce) return err('nonceMismatch');

  const binding = verifyCardKeyBinding(wire.binding, {
    rootDid: ctx.senderRootDid,
    cardDid: verified.holderDid,
    aud: ctx.aud,
    nonce: ctx.nonce,
    notBefore,
    notAfter,
  });
  if (!binding.ok) return err('bindingRejected');

  return ok({
    cardDid: verified.holderDid,
    credentials: verified.credentials.map((vc) => view(vc, verified.holderDid, ctx.senderRootDid)),
    presentedAt: iat,
  });
}
