/**
 * creds private messages (`creds.dm.v1`) — the content of a NIP-17 rumor of
 * kind `KIND_CREDS_PRIVATE`, plus the kind 10050 DM relay list (docs/ref/16 §2).
 *
 * A custom rumor kind (not kind 14 chat) so other Nostr clients holding the
 * same nsec ignore these instead of showing JSON. Relays never see the rumor
 * kind — only the kind 1059 wrap.
 *
 * Every message may carry the sender's public-projection Page JWS (`page`):
 * the receiver checks its root-DID signature (app side) and `pageBindsSender`
 * — that is how an npub is tied to a DID without a network round trip.
 */
import { z } from 'zod';

import { deviceProofSchema, type DeviceProof } from '../deviceproof/witness';
import { err, ok, type Result } from '../types/result';

import type { UnsignedNostrEvent } from './event';
import type { RumorInput, UnwrappedMessage } from './giftWrap';
import { hexToNpub } from './npub';

/** Unregistered regular kind (NIPs README, 2026-11-05). Rumor-only. */
export const KIND_CREDS_PRIVATE = 4410;
/** NIP-17 / NIP-51: relays a user receives DMs on. */
export const KIND_DM_RELAYS = 10050;

export const PASSPORT_REQUEST_CLAIMS = ['passport.name', 'passport.nationality'] as const;
export type PassportRequestClaim = (typeof PASSPORT_REQUEST_CLAIMS)[number];

export const MAX_REQUEST_LIFETIME_SECONDS = 7 * 86_400;
const SKEW_SECONDS = 300;
const MAX_PAGE_CHARS = 24_000;
const MAX_DM_RELAYS = 3;

const nonceSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const pageSchema = z.string().min(1).max(MAX_PAGE_CHARS).optional();

const proofRequestSchema = z
  .object({
    v: z.literal(1),
    type: z.literal('proof.request'),
    page: pageSchema,
    claims: z
      .array(z.enum(PASSPORT_REQUEST_CLAIMS))
      .min(1)
      .max(8)
      .refine((list) => new Set(list).size === list.length),
    purpose: z.string().min(1).max(140).optional(),
    nonce: nonceSchema,
    exp: z.number().int().positive(),
  })
  .strict();

const passportPresentationWireSchema = z
  .object({
    statement: z.string().min(1).max(2048),
    device: deviceProofSchema.nullable(),
  })
  .strict();
export interface PassportPresentationWire {
  readonly statement: string;
  readonly device: DeviceProof | null;
}

const proofResponseSchema = z
  .object({
    v: z.literal(1),
    type: z.literal('proof.response'),
    page: pageSchema,
    passport: passportPresentationWireSchema,
  })
  .strict();

const contactShareSchema = z
  .object({
    v: z.literal(1),
    type: z.literal('contact.share'),
    page: pageSchema,
    phone: z.string().trim().min(1).max(32).optional(),
    email: z.string().trim().min(1).max(254).optional(),
    note: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .refine((m) => m.phone !== undefined || m.email !== undefined || m.note !== undefined);

/** Ask for "a credential": no claim list — the holder picks (docs/ref/16 §12). */
const credentialRequestSchema = z
  .object({
    v: z.literal(1),
    type: z.literal('credential.request'),
    page: pageSchema,
    purpose: z.string().min(1).max(140).optional(),
    nonce: nonceSchema,
    exp: z.number().int().positive(),
  })
  .strict();

/** A vp+jwt from the holder's signing key, plus the root DID's cardKeyBinding. */
const credentialResponseSchema = z
  .object({
    v: z.literal(1),
    type: z.literal('credential.response'),
    page: pageSchema,
    vp: z.string().min(1).max(60_000),
    binding: z.string().min(1).max(4_000),
  })
  .strict();

const messageSchema = z.union([
  proofRequestSchema,
  proofResponseSchema,
  contactShareSchema,
  credentialRequestSchema,
  credentialResponseSchema,
]);

export type ProofRequestMessage = z.infer<typeof proofRequestSchema>;
export type ProofResponseMessage = z.infer<typeof proofResponseSchema>;
export type ContactShareMessage = z.infer<typeof contactShareSchema>;
export type CredentialRequestMessage = z.infer<typeof credentialRequestSchema>;
export type CredentialResponseMessage = z.infer<typeof credentialResponseSchema>;
export type PrivateMessage =
  | ProofRequestMessage
  | ProofResponseMessage
  | ContactShareMessage
  | CredentialRequestMessage
  | CredentialResponseMessage;

export type PrivateMessageRejection = 'notCreds' | 'notForMe' | 'malformed' | 'expired' | 'expiryTooFar';

export interface ParsedPrivateMessage {
  readonly message: PrivateMessage;
  readonly senderHex: string;
  readonly rumorId: string;
  readonly wrapId: string;
  /** Unix seconds, from the rumor (the canonical time). */
  readonly createdAt: number;
  /** For `proof.response` / `credential.response`: the request's rumor id (its `e` tag). */
  readonly replyTo?: string;
}

/**
 * Parse an already-unwrapped rumor. Does NOT check the Page signature or the
 * npub binding (that needs the app's JWS verifier) — see `pageBindsSender`.
 */
export function parsePrivateMessage(
  unwrapped: UnwrappedMessage,
  myHex: string,
  nowSeconds: number
): Result<ParsedPrivateMessage, PrivateMessageRejection> {
  const { rumor } = unwrapped;
  if (rumor.kind !== KIND_CREDS_PRIVATE) return err('notCreds');
  const me = myHex.toLowerCase();
  if (!rumor.tags.some((t) => t[0] === 'p' && t[1]?.toLowerCase() === me)) return err('notForMe');

  let json: unknown;
  try {
    json = JSON.parse(rumor.content) as unknown;
  } catch {
    return err('malformed');
  }
  const parsed = messageSchema.safeParse(json);
  if (!parsed.success) return err('malformed');
  const message = parsed.data;

  const base = {
    message,
    senderHex: unwrapped.senderHex,
    rumorId: rumor.id,
    wrapId: unwrapped.wrapId,
    createdAt: rumor.created_at,
  };

  if (message.type === 'proof.request' || message.type === 'credential.request') {
    if (message.exp <= nowSeconds) return err('expired');
    if (message.exp > nowSeconds + MAX_REQUEST_LIFETIME_SECONDS + SKEW_SECONDS) return err('expiryTooFar');
    return ok(base);
  }
  if (message.type === 'proof.response' || message.type === 'credential.response') {
    const replyTo = rumor.tags.find((t) => t[0] === 'e')?.[1];
    if (replyTo === undefined || !/^[0-9a-f]{64}$/u.test(replyTo)) return err('malformed');
    return ok({ ...base, replyTo });
  }
  return ok(base);
}

/** The Page (already signature-verified by the caller) names this sender's npub. */
export function pageBindsSender(record: { readonly alsoKnownAs: readonly string[] }, senderHex: string): boolean {
  const npub = hexToNpub(senderHex);
  return npub.ok && record.alsoKnownAs.includes(`nostr:${npub.value}`);
}

function rumorInput(recipientHex: string, body: Record<string, unknown>, extraTags: string[][] = []): Omit<RumorInput, 'created_at'> {
  return {
    kind: KIND_CREDS_PRIVATE,
    tags: [['p', recipientHex.toLowerCase()], ...extraTags],
    content: JSON.stringify({ v: 1, ...body }),
  };
}

export function buildProofRequestRumor(args: {
  readonly recipientHex: string;
  readonly claims: readonly PassportRequestClaim[];
  readonly nonce: string;
  readonly exp: number;
  readonly page?: string;
  readonly purpose?: string;
}): Omit<RumorInput, 'created_at'> {
  return rumorInput(args.recipientHex, {
    type: 'proof.request',
    ...(args.page === undefined ? {} : { page: args.page }),
    claims: args.claims,
    ...(args.purpose === undefined ? {} : { purpose: args.purpose }),
    nonce: args.nonce,
    exp: args.exp,
  });
}

export function buildProofResponseRumor(args: {
  readonly recipientHex: string;
  readonly requestId: string;
  readonly passport: PassportPresentationWire;
  readonly page?: string;
}): Omit<RumorInput, 'created_at'> {
  return rumorInput(
    args.recipientHex,
    { type: 'proof.response', ...(args.page === undefined ? {} : { page: args.page }), passport: args.passport },
    [['e', args.requestId]]
  );
}

export function buildCredentialRequestRumor(args: {
  readonly recipientHex: string;
  readonly nonce: string;
  readonly exp: number;
  readonly page?: string;
  readonly purpose?: string;
}): Omit<RumorInput, 'created_at'> {
  return rumorInput(args.recipientHex, {
    type: 'credential.request',
    ...(args.page === undefined ? {} : { page: args.page }),
    ...(args.purpose === undefined ? {} : { purpose: args.purpose }),
    nonce: args.nonce,
    exp: args.exp,
  });
}

export function buildCredentialResponseRumor(args: {
  readonly recipientHex: string;
  readonly requestId: string;
  readonly vp: string;
  readonly binding: string;
  readonly page?: string;
}): Omit<RumorInput, 'created_at'> {
  return rumorInput(
    args.recipientHex,
    {
      type: 'credential.response',
      ...(args.page === undefined ? {} : { page: args.page }),
      vp: args.vp,
      binding: args.binding,
    },
    [['e', args.requestId]]
  );
}

export function buildContactShareRumor(args: {
  readonly recipientHex: string;
  readonly page?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly note?: string;
}): Omit<RumorInput, 'created_at'> {
  const { recipientHex, ...fields } = args;
  return rumorInput(recipientHex, { type: 'contact.share', ...fields });
}

export function buildDmRelayListEvent(relays: readonly string[]): UnsignedNostrEvent {
  return { kind: KIND_DM_RELAYS, tags: relays.map((r) => ['relay', r]), content: '' };
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/u;

/** A relay we are willing to dial: wss, a DNS hostname, not a local name. */
function normalizeRelay(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'wss:' || url.username !== '' || url.password !== '') return null;
  const host = url.hostname.toLowerCase();
  if (host.length === 0 || host.startsWith('[') || host.includes(':') || IPV4.test(host)) return null;
  if (host === 'localhost' || !host.includes('.')) return null;
  if (/\.(local|localhost|internal|lan|home|arpa)$/u.test(host)) return null;
  const path = url.pathname === '/' ? '' : url.pathname;
  return `wss://${host}${url.port === '' ? '' : `:${url.port}`}${path}`;
}

/**
 * Relays from someone's kind 10050. The list is chosen by them, so dialling it
 * is their choice of host: only public wss hostnames, at most three.
 */
export function parseDmRelayList(event: { readonly kind: number; readonly tags: readonly (readonly string[])[] }): string[] {
  if (event.kind !== KIND_DM_RELAYS) return [];
  const out: string[] = [];
  for (const tag of event.tags) {
    if (tag[0] !== 'relay' || tag[1] === undefined) continue;
    const relay = normalizeRelay(tag[1]);
    if (relay !== null && !out.includes(relay)) out.push(relay);
    if (out.length === MAX_DM_RELAYS) break;
  }
  return out;
}
