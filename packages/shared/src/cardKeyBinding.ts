/**
 * cardKeyBinding: the root DID (the one that signs the Page) vouching for the
 * signing key that signed a VP — for one requester (`aud`) and one request
 * (`nonce`). Without it a requester only learns "some key signed this VP",
 * not that it belongs to the person whose Page they saved (docs/ref/16 §0, §12).
 *
 * Time is checked against the request window, not against "now": a private
 * answer waits on relays until the requester next opens the app.
 * Never throws; every rejection is a fixed tag.
 */
import { z } from 'zod';

import { signCompact, verifyCompact, type Signer } from './jws';
import { err, ok, type Result } from './types/result';

export const CARD_KEY_BINDING_TYPE = 'solidarity.cardKeyBinding.v1';

const claimsSchema = z
  .object({
    typ: z.literal(CARD_KEY_BINDING_TYPE),
    rootDid: z.string().startsWith('did:key:'),
    cardDid: z.string().startsWith('did:key:'),
    aud: z.string().min(1),
    nonce: z.string().min(1),
    iat: z.number().int().positive(),
    exp: z.number().int().positive(),
  })
  .refine((c) => c.exp >= c.iat);

export type CardKeyBindingClaims = z.infer<typeof claimsSchema>;

export type CardKeyBindingRejection =
  | 'badSignature'
  | 'malformed'
  | 'wrongRoot'
  | 'wrongCard'
  | 'wrongAudience'
  | 'wrongNonce'
  | 'outsideWindow';

export function buildCardKeyBindingJws(args: {
  readonly rootDid: string;
  readonly cardDid: string;
  readonly aud: string;
  readonly nonce: string;
  readonly iat: number;
  readonly exp: number;
  readonly sign: Signer;
}): Promise<string> {
  const claims: CardKeyBindingClaims = {
    typ: CARD_KEY_BINDING_TYPE,
    rootDid: args.rootDid,
    cardDid: args.cardDid,
    aud: args.aud,
    nonce: args.nonce,
    iat: args.iat,
    exp: args.exp,
  };
  return signCompact(claims, args.rootDid, args.sign);
}

export function verifyCardKeyBinding(
  jws: string,
  expected: {
    readonly rootDid: string;
    readonly cardDid: string;
    readonly aud: string;
    readonly nonce: string;
    /** The request window (unix s): when it was sent, and the latest a valid answer could be made. */
    readonly notBefore: number;
    readonly notAfter: number;
  }
): Result<CardKeyBindingClaims, CardKeyBindingRejection> {
  const verified = verifyCompact(jws, expected.rootDid);
  if (!verified.ok) return err('badSignature');
  const parsed = claimsSchema.safeParse(verified.value);
  if (!parsed.success) return err('malformed');
  const claims = parsed.data;
  if (claims.rootDid !== expected.rootDid) return err('wrongRoot');
  if (claims.cardDid !== expected.cardDid) return err('wrongCard');
  if (claims.aud !== expected.aud) return err('wrongAudience');
  if (claims.nonce !== expected.nonce) return err('wrongNonce');
  if (claims.iat < expected.notBefore || claims.iat > expected.notAfter) return err('outsideWindow');
  return ok(claims);
}
