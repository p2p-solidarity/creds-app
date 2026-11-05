/**
 * Private passport presentation (src/deviceproof/passportPresentation.ts,
 * docs/ref/16 §11): the holder's device key signs, at answer time, only the
 * claims the holder chose, bound to the requester and the request nonce.
 *
 * Failure modes, listed before the code (§11.5):
 *  parse    not JSON, unknown fields, wrong version/typ.
 *  binding  holder ≠ sender, aud ≠ me, nonce ≠ the request's.
 *  claims   none, a claim nobody asked for, bad nationality, blank or overlong name.
 *  time     signed too long ago or in the future, chip read after signing.
 *  device   notary proof, a proof that does not verify (another npub, other bytes) → reject, never downgrade.
 *  tier     no device → L1; device ok but chip not passiveAuth → L1; device ok + passiveAuth → L3.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { base64Decode } from '../src/crypto/base64';
import { hexToBytes } from '../src/crypto/hex';
import { APPLE_APP_ATTEST_ROOT_B64, type DeviceProof, type DeviceProofTrust } from '../src/deviceproof';
import {
  buildPassportPresentation,
  verifyPassportPresentation,
  verifyPassportPresentationWith,
  type PassportPresentation,
} from '../src/deviceproof/passportPresentation';
import { nostrPublicKeyHex } from '../src/nostr/event';
import { hexToNpub } from '../src/nostr/npub';
import { err, ok } from '../src/types/result';

const HOLDER_HEX = nostrPublicKeyHex(hexToBytes('11'.repeat(32)));
const ME_HEX = nostrPublicKeyHex(hexToBytes('22'.repeat(32)));
const OTHER_HEX = nostrPublicKeyHex(hexToBytes('33'.repeat(32)));
const npub = (hex: string): string => {
  const r = hexToNpub(hex);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const NOW = 1_762_300_000;
const NONCE = 'ab'.repeat(32);

const trust: DeviceProofTrust = {
  appleAppId: 'V8H6LQ9448.io.uebelacker.AppAttestExample',
  appleEnvironment: 'production',
  appleRoots: [base64Decode(APPLE_APP_ATTEST_ROOT_B64)],
  androidPackage: 'com.example',
  androidSignatureDigests: [],
  googleRoots: [],
  notaryPubkeys: [OTHER_HEX],
};
const ios = JSON.parse(
  readFileSync(join(import.meta.dir, 'fixtures', 'deviceproof', 'appattest', 'attestation-production.json'), 'utf8')
) as { attestation: string; keyId: string };
const iosDevice: DeviceProof = { platform: 'ios', attestation: ios.attestation, keyId: ios.keyId, assertion: 'AA==' };

function presentation(over: Partial<PassportPresentation> = {}): PassportPresentation {
  return {
    v: 1,
    typ: 'creds.passport.present.v1',
    holder: npub(HOLDER_HEX),
    aud: npub(ME_HEX),
    nonce: NONCE,
    claims: { nationality: 'JPN' },
    chip: 'passiveAuth',
    readAt: NOW - 86_400,
    signedAt: NOW - 10,
    ...over,
  };
}

const ctx = {
  senderHex: HOLDER_HEX,
  myHex: ME_HEX,
  nonce: NONCE,
  requested: ['passport.name', 'passport.nationality'] as const,
  requestSentAt: NOW - 2 * 86_400,
  requestExp: NOW + 5 * 86_400,
  nowSeconds: NOW,
};

const deviceOk = verifyPassportPresentationWith(() => ok(new Uint8Array([1])));
const deviceBad = verifyPassportPresentationWith(() => err('bad device'));

function reason(statement: string, device: DeviceProof | null = null, verify = deviceOk, c = ctx): string {
  const r = verify({ statement, device }, c, trust);
  return r.ok ? `ok:${r.value.tier}` : r.error;
}
const json = (p: object): string => JSON.stringify(p);

describe('buildPassportPresentation', () => {
  it('keeps only the chosen claims and stamps the binding', () => {
    const built = buildPassportPresentation({
      holderHex: HOLDER_HEX,
      audHex: ME_HEX,
      nonce: NONCE,
      claims: { name: 'TANAKA HANAKO', nationality: 'JPN' },
      chosen: ['passport.nationality'],
      chip: 'passiveAuth',
      readAt: NOW - 86_400,
      signedAt: NOW,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const parsed = JSON.parse(built.value) as PassportPresentation;
    expect(parsed.claims).toEqual({ nationality: 'JPN' });
    expect(parsed.aud).toBe(npub(ME_HEX));
  });

  it('refuses to build with nothing chosen or a chosen claim the holder lacks', () => {
    const base = {
      holderHex: HOLDER_HEX,
      audHex: ME_HEX,
      nonce: NONCE,
      claims: { nationality: 'JPN' },
      chip: 'simulated' as const,
      readAt: NOW - 1,
      signedAt: NOW,
    };
    expect(buildPassportPresentation({ ...base, chosen: [] }).ok).toBe(false);
    expect(buildPassportPresentation({ ...base, chosen: ['passport.name'] }).ok).toBe(false);
  });
});

describe('verifyPassportPresentation — parse', () => {
  it('rejects non-JSON, unknown fields and wrong version/typ', () => {
    expect(reason('nope')).toBe('malformed');
    expect(reason(json({ ...presentation(), extra: 1 }))).toBe('malformed');
    expect(reason(json(presentation({ v: 2 as 1 })))).toBe('malformed');
    expect(reason(json(presentation({ typ: 'creds.passport.v1' as 'creds.passport.present.v1' })))).toBe('malformed');
  });
});

describe('verifyPassportPresentation — binding', () => {
  it('rejects a statement by someone other than the sender', () => {
    expect(reason(json(presentation({ holder: npub(OTHER_HEX) })))).toBe('notBySender');
  });
  it('rejects a statement meant for someone else', () => {
    expect(reason(json(presentation({ aud: npub(OTHER_HEX) })))).toBe('notForMe');
  });
  it('rejects a statement for another request', () => {
    expect(reason(json(presentation({ nonce: 'cd'.repeat(32) })))).toBe('nonceMismatch');
  });
});

describe('verifyPassportPresentation — claims', () => {
  it('rejects no claims, unrequested claims and bad values', () => {
    expect(reason(json(presentation({ claims: {} })))).toBe('malformed');
    expect(reason(json(presentation({ claims: { nationality: 'jpn' } })))).toBe('malformed');
    expect(reason(json(presentation({ claims: { name: '   ' } })))).toBe('malformed');
    expect(reason(json(presentation({ claims: { name: 'x'.repeat(81) } })))).toBe('malformed');
    const onlyNationality = { ...ctx, requested: ['passport.nationality'] as const };
    expect(reason(json(presentation({ claims: { name: 'TANAKA' } })), null, deviceOk, onlyNationality)).toBe('notRequested');
  });
});

describe('verifyPassportPresentation — time', () => {
  it('accepts an answer read long after it was signed (the inbox is asynchronous)', () => {
    expect(reason(json(presentation({ readAt: NOW - 3 * 86_400, signedAt: NOW - 86_400 })))).toBe('ok:L1');
  });

  it('rejects a statement signed before the request existed', () => {
    expect(reason(json(presentation({ readAt: NOW - 4 * 86_400, signedAt: NOW - 3 * 86_400 })))).toBe('notCurrent');
  });

  it('rejects a statement signed after the request expired', () => {
    const expired = { ...ctx, requestExp: NOW - 86_400 };
    expect(reason(json(presentation({ readAt: NOW - 3 * 86_400, signedAt: NOW - 3600 })), null, deviceOk, expired)).toBe('notCurrent');
  });

  it('rejects future and read-after-sign statements', () => {
    expect(reason(json(presentation({ signedAt: NOW + 3600 })))).toBe('notCurrent');
    expect(reason(json(presentation({ readAt: NOW })))).toBe('malformed');
  });
});

describe('verifyPassportPresentation — device and tier', () => {
  it('a missing device proof is accepted as L1', () => {
    expect(reason(json(presentation()), null)).toBe('ok:L1');
  });

  it('a valid device proof over a passive-auth chip is L3; any other chip state stays L1', () => {
    expect(reason(json(presentation()), iosDevice)).toBe('ok:L3');
    expect(reason(json(presentation({ chip: 'simulated' })), iosDevice)).toBe('ok:L1');
    expect(reason(json(presentation({ chip: 'unverified' })), iosDevice)).toBe('ok:L1');
  });

  it('a device proof that does not verify rejects the whole answer (never downgrades)', () => {
    expect(reason(json(presentation()), iosDevice, deviceBad)).toBe('deviceRejected');
  });

  it('the notary never vouches for a passport', () => {
    expect(reason(json(presentation()), { platform: 'notary' })).toBe('deviceRejected');
  });

  it('the real verifier rejects a fixture attested for another key', () => {
    const r = verifyPassportPresentation({ statement: json(presentation()), device: iosDevice }, ctx, trust);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('deviceRejected');
  });

  it('returns the disclosed claims and chip', () => {
    const r = deviceOk({ statement: json(presentation({ claims: { name: 'TANAKA HANAKO', nationality: 'JPN' } })), device: null }, ctx, trust);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.claims).toEqual({ name: 'TANAKA HANAKO', nationality: 'JPN' });
    expect(r.value.chip).toBe('passiveAuth');
    expect(r.value.tier).toBe('L1');
  });
});
