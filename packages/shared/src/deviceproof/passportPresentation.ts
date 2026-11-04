/**
 * Private passport presentation (docs/ref/16 §11): when a holder agrees to a
 * request, their device key signs — then and there — a statement holding only
 * the claims they chose, bound to the requester's npub and the request nonce.
 * It travels inside a NIP-17 gift wrap, never on a public relay.
 *
 * Same trust model as the public passport statement (docs/ref/11 §6.1): a
 * verified device proof says "a genuine creds app on a real phone signed
 * this". Only that AND a chip that passed passive authentication is L3; any
 * answer without a device proof is shown as L1, never as more. A device proof
 * that is present but does not verify rejects the whole answer.
 */
import { z } from 'zod';

import { hexToNpub, npubToHex } from '../nostr/npub';
import type { PassportPresentationWire, PassportRequestClaim } from '../nostr/privateMessage';
import { err, ok, type Result } from '../types/result';

import { verifyDeviceProof, type DeviceProofTrust } from './witness';

export const PASSPORT_PRESENTATION_TYP = 'creds.passport.present.v1';
/** Signed when the holder answers, so it must be fresh. */
const FRESH_SECONDS = 300;

const claimsSchema = z
  .object({
    name: z.string().max(80).refine((s) => s.trim().length > 0).optional(),
    nationality: z.string().regex(/^[A-Z]{3}$/u).optional(),
  })
  .strict()
  .refine((c) => c.name !== undefined || c.nationality !== undefined);

const presentationSchema = z
  .object({
    v: z.literal(1),
    typ: z.literal(PASSPORT_PRESENTATION_TYP),
    holder: z.string().startsWith('npub1'),
    aud: z.string().startsWith('npub1'),
    nonce: z.string().regex(/^[0-9a-f]{64}$/u),
    claims: claimsSchema,
    chip: z.enum(['passiveAuth', 'simulated', 'unverified']),
    readAt: z.number().int().positive(),
    signedAt: z.number().int().positive(),
  })
  .strict()
  .refine((p) => p.readAt < p.signedAt);

export type PassportPresentation = z.infer<typeof presentationSchema>;
export type PassportChipState = PassportPresentation['chip'];
export type PassportClaimValues = PassportPresentation['claims'];

const CLAIM_FIELD: Readonly<Record<PassportRequestClaim, keyof PassportClaimValues>> = {
  'passport.name': 'name',
  'passport.nationality': 'nationality',
};

export function buildPassportPresentation(args: {
  readonly holderHex: string;
  readonly audHex: string;
  readonly nonce: string;
  /** Everything this phone knows from the chip. */
  readonly claims: { readonly name?: string; readonly nationality?: string };
  /** What the holder ticked on the consent sheet. */
  readonly chosen: readonly PassportRequestClaim[];
  readonly chip: PassportChipState;
  readonly readAt: number;
  readonly signedAt: number;
}): Result<string, 'nothingChosen' | 'claimUnavailable' | 'invalid'> {
  if (args.chosen.length === 0) return err('nothingChosen');
  const claims: { name?: string; nationality?: string } = {};
  for (const claim of args.chosen) {
    const field = CLAIM_FIELD[claim];
    const value = args.claims[field];
    if (value === undefined) return err('claimUnavailable');
    claims[field] = value;
  }
  const holder = hexToNpub(args.holderHex);
  const aud = hexToNpub(args.audHex);
  if (!holder.ok || !aud.ok) return err('invalid');
  const presentation = {
    v: 1,
    typ: PASSPORT_PRESENTATION_TYP,
    holder: holder.value,
    aud: aud.value,
    nonce: args.nonce,
    claims,
    chip: args.chip,
    readAt: args.readAt,
    signedAt: args.signedAt,
  };
  return presentationSchema.safeParse(presentation).success ? ok(JSON.stringify(presentation)) : err('invalid');
}

export type PassportPresentationRejection =
  | 'malformed'
  | 'notBySender'
  | 'notForMe'
  | 'nonceMismatch'
  | 'notRequested'
  | 'notCurrent'
  | 'deviceRejected';

export interface PassportPresentationContext {
  /** The authenticated author of the gift wrap (seal signer). */
  readonly senderHex: string;
  readonly myHex: string;
  /** The nonce of the request this answers. */
  readonly nonce: string;
  readonly requested: readonly PassportRequestClaim[];
  readonly nowSeconds: number;
}

export interface VerifiedPassportPresentation {
  readonly claims: PassportClaimValues;
  readonly chip: PassportChipState;
  readonly tier: 'L3' | 'L1';
  readonly readAt: number;
}

type DeviceVerifier = typeof verifyDeviceProof;

/** Exposed for tests that need a device proof to verify; production uses `verifyPassportPresentation`. */
export function verifyPassportPresentationWith(verifyDevice: DeviceVerifier) {
  return (
    wire: PassportPresentationWire,
    ctx: PassportPresentationContext,
    trust: DeviceProofTrust
  ): Result<VerifiedPassportPresentation, PassportPresentationRejection> => {
    let presentation: PassportPresentation;
    try {
      const parsed = presentationSchema.safeParse(JSON.parse(wire.statement));
      if (!parsed.success) return err('malformed');
      presentation = parsed.data;
    } catch {
      return err('malformed');
    }

    const holderHex = npubToHex(presentation.holder);
    const audHex = npubToHex(presentation.aud);
    if (!holderHex.ok || !audHex.ok) return err('malformed');
    if (holderHex.value !== ctx.senderHex.toLowerCase()) return err('notBySender');
    if (audHex.value !== ctx.myHex.toLowerCase()) return err('notForMe');
    if (presentation.nonce !== ctx.nonce) return err('nonceMismatch');

    const allowed = new Set(ctx.requested.map((c) => CLAIM_FIELD[c]));
    for (const field of Object.keys(presentation.claims) as (keyof PassportClaimValues)[]) {
      if (!allowed.has(field)) return err('notRequested');
    }
    if (Math.abs(ctx.nowSeconds - presentation.signedAt) > FRESH_SECONDS) return err('notCurrent');

    let deviceVerified = false;
    if (wire.device !== null) {
      if (wire.device.platform === 'notary') return err('deviceRejected');
      const checked = verifyDevice(
        wire.device,
        new TextEncoder().encode(wire.statement),
        holderHex.value,
        presentation.signedAt * 1000,
        trust
      );
      if (!checked.ok) return err('deviceRejected');
      deviceVerified = true;
    }

    return ok({
      claims: presentation.claims,
      chip: presentation.chip,
      tier: deviceVerified && presentation.chip === 'passiveAuth' ? 'L3' : 'L1',
      readAt: presentation.readAt,
    });
  };
}

export const verifyPassportPresentation = verifyPassportPresentationWith(verifyDeviceProof);
