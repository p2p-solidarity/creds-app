/**
 * Apple App Attest (docs/ref/10 §3.11, Apple "Validating apps that connect to
 * your server"), verified offline by anyone holding Apple's pinned root.
 *
 * Attestation: once per device key — proves the key lives in the Secure
 * Enclave of a genuine device and belongs to our App ID. Assertion: per
 * signed statement — proves that key signed this exact client data.
 *
 * Offline verifiers cannot enforce the assertion counter's monotonicity
 * (that needs stored state); the counter is returned, not checked.
 */
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { cborDecode } from '../qr/cbor';
import { err, ok, type Result } from '../types/result';
import { verifyCertChain } from './chain';
import { DER, derChildren, derExpect, derOctets, derParse } from './der';
import { equalBytes } from './x509';

const OID_NONCE = '1.2.840.113635.100.8.2';
const AAGUID: Readonly<Record<AppAttestEnvironment, Uint8Array>> = {
  production: new Uint8Array([...new TextEncoder().encode('appattest'), 0, 0, 0, 0, 0, 0, 0]),
  development: new TextEncoder().encode('appattestdevelop'),
};

export type AppAttestEnvironment = 'production' | 'development';

export interface AppAttestationInput {
  readonly attestationObject: Uint8Array;
  readonly keyId: Uint8Array;
  /** SHA-256 of the challenge the app passed to `attestKey`. */
  readonly clientDataHash: Uint8Array;
  /** `<TeamID>.<bundle id>` */
  readonly appId: string;
  readonly environment: AppAttestEnvironment;
  /** Pinned Apple App Attestation root(s), DER. */
  readonly roots: readonly Uint8Array[];
  /** When the attestation is claimed to have been made (unix ms). */
  readonly at: number;
}

const field = (map: unknown, key: string): unknown => (map instanceof Map ? map.get(key) : undefined);
const bytes = (v: unknown): v is Uint8Array => v instanceof Uint8Array;

function decodeMap(raw: Uint8Array): Result<Map<unknown, unknown>, string> {
  try {
    const v = cborDecode(raw);
    return v instanceof Map ? ok(v) : err('not a CBOR map');
  } catch {
    return err('malformed CBOR');
  }
}

/** The credential certificate's nonce extension: SEQUENCE { [1] EXPLICIT OCTET STRING }. */
function certNonce(value: Uint8Array): Uint8Array | null {
  try {
    const tagged = derChildren(derExpect(derParse(value), DER.SEQUENCE))[0];
    if (tagged === undefined || tagged.cls !== 2 || tagged.tag !== 1) return null;
    return derOctets(derChildren(tagged)[0]);
  } catch {
    return null;
  }
}

/** Returns the attested P-256 public key (uncompressed point). */
export function verifyAppAttestation(input: AppAttestationInput): Result<{ readonly publicKey: Uint8Array }, string> {
  const obj = decodeMap(input.attestationObject);
  if (!obj.ok) return obj;
  if (field(obj.value, 'fmt') !== 'apple-appattest') return err('not an App Attest attestation');
  const x5c = field(field(obj.value, 'attStmt'), 'x5c');
  const authData = field(obj.value, 'authData');
  if (!Array.isArray(x5c) || !x5c.every(bytes) || !bytes(authData)) return err('malformed attestation');

  const chain = verifyCertChain(x5c, { roots: input.roots, at: input.at });
  if (!chain.ok) return chain;
  const cred = chain.value[0];
  if (cred === undefined || cred.key.kind !== 'ec' || cred.key.curve !== 'p256') return err('credential key is not P-256');

  const nonceExt = cred.extensions.get(OID_NONCE);
  const nonce = nonceExt === undefined ? null : certNonce(nonceExt);
  if (nonce === null || !equalBytes(nonce, sha256(new Uint8Array([...authData, ...input.clientDataHash])))) {
    return err('nonce does not match the challenge');
  }
  const publicKey = cred.key.point;
  if (!equalBytes(sha256(publicKey), input.keyId)) return err('key id is not the credential key');

  if (authData.length < 55) return err('authenticator data too short');
  if (!equalBytes(authData.subarray(0, 32), sha256(new TextEncoder().encode(input.appId)))) return err('attestation is for another app');
  const counter = new DataView(authData.buffer, authData.byteOffset + 33, 4).getUint32(0);
  if (counter !== 0) return err('attestation counter is not 0');
  if (!equalBytes(authData.subarray(37, 53), AAGUID[input.environment])) return err(`not a ${input.environment} App Attest key`);
  const credIdLen = new DataView(authData.buffer, authData.byteOffset + 53, 2).getUint16(0);
  if (!equalBytes(authData.subarray(55, 55 + credIdLen), input.keyId)) return err('credential id is not the key id');
  return ok({ publicKey });
}

export interface AppAttestAssertionInput {
  readonly assertion: Uint8Array;
  /** The exact bytes the app passed to `generateAssertion` (hashed by the app). */
  readonly clientData: Uint8Array;
  /** The attested key from `verifyAppAttestation`. */
  readonly publicKey: Uint8Array;
  readonly appId: string;
}

export function verifyAppAttestAssertion(input: AppAttestAssertionInput): Result<{ readonly counter: number }, string> {
  const obj = decodeMap(input.assertion);
  if (!obj.ok) return obj;
  const signature = field(obj.value, 'signature');
  const authData = field(obj.value, 'authenticatorData');
  if (!bytes(signature) || !bytes(authData) || authData.length < 37) return err('malformed assertion');

  const nonce = sha256(new Uint8Array([...authData, ...sha256(input.clientData)]));
  let valid = false;
  try {
    valid = p256.verify(signature, nonce, input.publicKey, { format: 'der', lowS: false });
  } catch {
    valid = false;
  }
  if (!valid) return err('assertion signature does not verify');
  if (!equalBytes(authData.subarray(0, 32), sha256(new TextEncoder().encode(input.appId)))) return err('assertion is for another app');
  return ok({ counter: new DataView(authData.buffer, authData.byteOffset + 33, 4).getUint32(0) });
}
