/**
 * Device-attested passport statements (docs/ref/11 §6.1, P1).
 *
 * Failure modes, listed before the code:
 *  event      bad nostr signature, wrong kind, d tag for something else, holder ≠ event author,
 *             `n` tag that disagrees with the statement's nullifier.
 *  statement  unsupported version, unknown fields (strict), nullifier that is not 64 lowercase hex,
 *             signed in the future, lapsed (> 90 days), chip read after signing.
 *  device     the Pro notary (it never reads a chip), a device key attested for another npub.
 *  count      one passport bound by two device keys is contested and counts for no one; the
 *             owner re-signing with the same key is one holder; statements without a nullifier
 *             (the badge, Q3) never count; holders who are not witnesses of this Page never count.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { base64Decode } from '../src/crypto/base64';
import {
  APPLE_APP_ATTEST_ROOT_B64,
  GOOGLE_EC_ROOT_B64,
  GOOGLE_RSA_ROOT_B64,
  PASSPORT_STATEMENT_D_TAG,
  buildPassportEvent,
  countPassportWitnesses,
  passportNullifier,
  verifyPassportStatement,
  type DeviceProofTrust,
  type PassportStatement,
  type VerifiedPassportStatement,
} from '../src/deviceproof';
import { signNostrEventWithScalar, type NostrEvent } from '../src/nostr/event';
import { hexToNpub } from '../src/nostr/npub';

const HOLDER_KEY = sha256(new TextEncoder().encode('passport holder test key'));
const OTHER_KEY = sha256(new TextEncoder().encode('someone else test key'));
const NOTARY_KEY = sha256(new TextEncoder().encode('notary test key'));
const hexOf = (scalar: Uint8Array): string => Buffer.from(schnorr.getPublicKey(scalar)).toString('hex');
const npubOf = (scalar: Uint8Array): string => {
  const r = hexToNpub(hexOf(scalar));
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const AT = Math.floor(Date.UTC(2024, 5, 1) / 1000);
const DAY = 86_400;
const NULLIFIER = passportNullifier(new TextEncoder().encode('a SOD'));

const trust: DeviceProofTrust = {
  appleAppId: 'V8H6LQ9448.io.uebelacker.AppAttestExample',
  appleEnvironment: 'production',
  appleRoots: [base64Decode(APPLE_APP_ATTEST_ROOT_B64)],
  androidPackage: 'com.google.android.attestation',
  androidSignatureDigests: [base64Decode('EDk47kU35Z6O55L2VFBPuDRvxrNG0LvEQV/DOfz8jsE=')],
  googleRoots: [GOOGLE_RSA_ROOT_B64, GOOGLE_EC_ROOT_B64].map(base64Decode),
  notaryPubkeys: [hexOf(NOTARY_KEY)],
};

const ios = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'deviceproof', 'appattest', 'attestation-production.json'), 'utf8')) as {
  attestation: string;
  keyId: string;
};
const iosDevice = { platform: 'ios' as const, attestation: ios.attestation, keyId: ios.keyId, assertion: 'AA==' };

const statement = (over: Partial<PassportStatement> = {}): PassportStatement => ({
  v: 1,
  holder: npubOf(HOLDER_KEY),
  ageOver18: true,
  nullifier: NULLIFIER,
  readAt: AT - DAY,
  signedAt: AT,
  ...over,
});

const signed = (st: PassportStatement, scalar = HOLDER_KEY, device: Parameters<typeof buildPassportEvent>[1] = iosDevice): NostrEvent => {
  const r = signNostrEventWithScalar(buildPassportEvent(st, device), scalar, st.signedAt);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const reason = (event: NostrEvent, now = AT): string => {
  const r = verifyPassportStatement(event, trust, now);
  return r.ok ? 'ok' : r.error;
};

describe('passportNullifier', () => {
  test('is a stable 64-hex value per SOD and differs between passports', () => {
    expect(NULLIFIER).toMatch(/^[0-9a-f]{64}$/u);
    expect(passportNullifier(new TextEncoder().encode('a SOD'))).toBe(NULLIFIER);
    expect(passportNullifier(new TextEncoder().encode('another SOD'))).not.toBe(NULLIFIER);
  });
});

describe('verifyPassportStatement', () => {
  test('events are NIP-78 app data with one d tag per holder and the nullifier as `n`', () => {
    const event = buildPassportEvent(statement(), iosDevice);
    expect(event.kind).toBe(30078);
    expect(event.tags).toEqual([
      ['d', PASSPORT_STATEMENT_D_TAG],
      ['n', NULLIFIER],
    ]);
    expect(buildPassportEvent(statement({ nullifier: undefined }), iosDevice).tags).toEqual([['d', PASSPORT_STATEMENT_D_TAG]]);
  });

  test('rejects a tampered event and a statement whose holder is not the author', () => {
    const event = signed(statement());
    expect(reason({ ...event, content: event.content.replace('true', 'false') })).toBe('nostr signature does not verify');
    expect(reason(signed(statement(), OTHER_KEY))).toBe('statement is not by the event author');
  });

  test('rejects another kind, another d tag and an n tag that disagrees with the statement', () => {
    const base = buildPassportEvent(statement(), iosDevice);
    const resign = (over: Partial<typeof base>): NostrEvent => {
      const r = signNostrEventWithScalar({ ...base, ...over }, HOLDER_KEY, AT);
      if (!r.ok) throw new Error(r.error);
      return r.value;
    };
    expect(reason(resign({ kind: 1 }))).toBe('not a passport statement');
    expect(reason(resign({ tags: [['d', 'creds.witness:x:@a:b'], ['n', NULLIFIER]] }))).toBe('not a passport statement');
    expect(reason(resign({ tags: [['d', PASSPORT_STATEMENT_D_TAG], ['n', passportNullifier(new Uint8Array([1]))]] }))).toBe(
      'n tag does not match the statement',
    );
    expect(reason(resign({ tags: [['d', PASSPORT_STATEMENT_D_TAG]] }))).toBe('n tag does not match the statement');
  });

  test('rejects an unsupported version, unknown fields and a malformed nullifier', () => {
    expect(reason(signed(statement({ v: 2 as 1 })))).toBe('malformed passport statement');
    expect(reason(signed({ ...statement(), nationality: 'TWN' } as PassportStatement))).toBe('malformed passport statement');
    expect(reason(signed(statement({ nullifier: NULLIFIER.toUpperCase() })))).toBe('malformed passport statement');
  });

  test('rejects a statement signed in the future, a lapsed one and a chip read after signing', () => {
    expect(reason(signed(statement({ signedAt: AT + 3600 })))).toBe('statement is not current');
    expect(reason(signed(statement()), AT + 91 * DAY)).toBe('statement is not current');
    expect(reason(signed(statement({ readAt: AT + 1 })))).toBe('malformed passport statement');
  });

  test('the notary never vouches for a passport, and a device key must be attested for the holder', () => {
    const fromNotary = signed(statement({ holder: npubOf(NOTARY_KEY) }), NOTARY_KEY, { platform: 'notary' });
    expect(reason(fromNotary)).toBe('a passport needs a device proof');
    // The fixture key was attested for another challenge, so it cannot vouch for this holder.
    expect(reason(signed(statement()))).toContain('nonce');
  });
});

describe('countPassportWitnesses', () => {
  const verified = (holderKey: Uint8Array, deviceKey: string, over: Partial<PassportStatement> = {}): VerifiedPassportStatement => ({
    statement: statement({ holder: npubOf(holderKey), ...over }),
    holderHex: hexOf(holderKey),
    deviceKey,
  });
  const witnesses = new Set([hexOf(HOLDER_KEY), hexOf(OTHER_KEY)]);

  test('counts each uncontested passport once among the Page witnesses', () => {
    const other = verified(OTHER_KEY, 'dev-b', { nullifier: passportNullifier(new Uint8Array([2])) });
    expect(countPassportWitnesses([verified(HOLDER_KEY, 'dev-a'), other], witnesses)).toBe(2);
    // Re-signing with the same device key is still one holder.
    expect(countPassportWitnesses([verified(HOLDER_KEY, 'dev-a'), verified(HOLDER_KEY, 'dev-a', { signedAt: AT - DAY })], witnesses)).toBe(1);
  });

  test('a passport bound by two device keys is contested and counts for no one', () => {
    expect(countPassportWitnesses([verified(HOLDER_KEY, 'dev-a'), verified(OTHER_KEY, 'dev-b')], witnesses)).toBe(0);
    // Even when only one of the two holders witnessed this Page.
    expect(countPassportWitnesses([verified(HOLDER_KEY, 'dev-a'), verified(OTHER_KEY, 'dev-b')], new Set([hexOf(HOLDER_KEY)]))).toBe(0);
  });

  test('badge-only statements and holders who are not witnesses never count', () => {
    expect(countPassportWitnesses([verified(HOLDER_KEY, 'dev-a', { nullifier: undefined })], witnesses)).toBe(0);
    expect(countPassportWitnesses([verified(HOLDER_KEY, 'dev-a')], new Set([hexOf(OTHER_KEY)]))).toBe(0);
  });
});
