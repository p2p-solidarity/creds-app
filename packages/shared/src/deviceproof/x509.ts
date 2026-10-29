/**
 * X.509 certificate parsing and signature checks — just what attestation
 * chains need: RSA (PKCS#1 v1.5) and ECDSA P-256/P-384 with SHA-256/384/512.
 * Any other algorithm is unsupported and therefore fails.
 */
import { p256, p384 } from '@noble/curves/nist.js';
import { sha256, sha384, sha512 } from '@noble/hashes/sha2.js';

import { DER, derBitString, derBoolean, derChildren, derExpect, derInteger, derOctets, derOid, derParse, derTime } from './der';
import { rsaPkcs1v15Verify, type RsaHash } from './rsa';

export type PublicKeyInfo =
  | { readonly kind: 'rsa'; readonly n: bigint; readonly e: bigint }
  | { readonly kind: 'ec'; readonly curve: 'p256' | 'p384'; readonly point: Uint8Array };

export interface Certificate {
  readonly raw: Uint8Array;
  readonly tbs: Uint8Array;
  /** Lowercase hex, no leading zeros — the form Google's revocation list uses. */
  readonly serial: string;
  readonly issuer: Uint8Array;
  readonly subject: Uint8Array;
  readonly notBefore: number;
  readonly notAfter: number;
  /** The SubjectPublicKeyInfo TLV — what roots are pinned by. */
  readonly spki: Uint8Array;
  readonly key: PublicKeyInfo;
  readonly sigAlg: string;
  readonly signature: Uint8Array;
  /** extnID → extnValue contents, in certificate order. */
  readonly extensions: ReadonlyMap<string, Uint8Array>;
  readonly isCA: boolean;
}

const OID_RSA = '1.2.840.113549.1.1.1';
const OID_EC = '1.2.840.10045.2.1';
const CURVES: Readonly<Record<string, 'p256' | 'p384'>> = { '1.2.840.10045.3.1.7': 'p256', '1.3.132.0.34': 'p384' };
const OID_BASIC_CONSTRAINTS = '2.5.29.19';

const SIG_ALGS: Readonly<Record<string, { readonly kind: 'rsa' | 'ec'; readonly hash: RsaHash }>> = {
  '1.2.840.113549.1.1.11': { kind: 'rsa', hash: 'sha256' },
  '1.2.840.113549.1.1.12': { kind: 'rsa', hash: 'sha384' },
  '1.2.840.113549.1.1.13': { kind: 'rsa', hash: 'sha512' },
  '1.2.840.10045.4.3.2': { kind: 'ec', hash: 'sha256' },
  '1.2.840.10045.4.3.3': { kind: 'ec', hash: 'sha384' },
  '1.2.840.10045.4.3.4': { kind: 'ec', hash: 'sha512' },
};
const HASH = { sha256, sha384, sha512 } as const;

function parseKey(spki: Uint8Array): PublicKeyInfo {
  const [alg, bits] = derChildren(derExpect(derParse(spki), DER.SEQUENCE));
  const [algOid, params] = derChildren(derExpect(alg, DER.SEQUENCE));
  const oid = derOid(algOid);
  const keyBytes = derBitString(bits);
  if (oid === OID_RSA) {
    const [n, e] = derChildren(derExpect(derParse(keyBytes), DER.SEQUENCE));
    return { kind: 'rsa', n: derInteger(n), e: derInteger(e) };
  }
  if (oid === OID_EC) {
    const curve = CURVES[derOid(params)];
    if (curve === undefined) throw new Error('x509: unsupported curve');
    return { kind: 'ec', curve, point: keyBytes };
  }
  throw new Error('x509: unsupported key algorithm');
}

export function parseCertificate(der: Uint8Array): Certificate {
  const [tbsNode, sigAlgNode, sigNode] = derChildren(derExpect(derParse(der), DER.SEQUENCE));
  const tbs = derChildren(derExpect(tbsNode, DER.SEQUENCE));
  let i = tbs[0]?.cls === 2 && tbs[0].tag === 0 ? 1 : 0; // [0] version
  const serial = derInteger(tbs[i++]);
  i++; // signature AlgorithmIdentifier (must match the outer one, checked below)
  const issuer = derExpect(tbs[i++], DER.SEQUENCE).raw;
  const [nb, na] = derChildren(derExpect(tbs[i++], DER.SEQUENCE));
  const subject = derExpect(tbs[i++], DER.SEQUENCE).raw;
  const spki = derExpect(tbs[i++], DER.SEQUENCE).raw;

  const extensions = new Map<string, Uint8Array>();
  let isCA = false;
  for (; i < tbs.length; i++) {
    const node = tbs[i];
    if (node?.cls !== 2 || node.tag !== 3) continue; // [1]/[2] unique IDs
    for (const ext of derChildren(derExpect(derChildren(node)[0], DER.SEQUENCE))) {
      const parts = derChildren(derExpect(ext, DER.SEQUENCE));
      const id = derOid(parts[0]);
      const value = derOctets(parts[parts.length - 1]);
      if (extensions.has(id)) throw new Error('x509: duplicate extension');
      extensions.set(id, value);
      if (id === OID_BASIC_CONSTRAINTS) {
        const bc = derChildren(derExpect(derParse(value), DER.SEQUENCE));
        isCA = bc[0]?.tag === DER.BOOLEAN ? derBoolean(bc[0]) : false;
      }
    }
  }

  const sigAlg = derOid(derChildren(derExpect(sigAlgNode, DER.SEQUENCE))[0]);
  const innerAlg = tbs[tbsNode !== undefined && tbs[0]?.cls === 2 ? 2 : 1];
  if (innerAlg === undefined || derOid(derChildren(innerAlg)[0]) !== sigAlg) throw new Error('x509: signature algorithm mismatch');
  return {
    raw: der,
    tbs: (tbsNode as { raw: Uint8Array }).raw,
    serial: serial.toString(16),
    issuer,
    subject,
    notBefore: derTime(nb),
    notAfter: derTime(na),
    spki,
    key: parseKey(spki),
    sigAlg,
    signature: derBitString(sigNode),
    extensions,
    isCA,
  };
}

/** Did `issuerKey` sign this certificate? Unknown algorithms or mismatched key types → false. */
export function isSignedBy(cert: Pick<Certificate, 'tbs' | 'sigAlg' | 'signature'>, issuerKey: PublicKeyInfo): boolean {
  const alg = SIG_ALGS[cert.sigAlg];
  if (alg === undefined || alg.kind !== issuerKey.kind) return false;
  const digest = HASH[alg.hash](cert.tbs);
  try {
    if (issuerKey.kind === 'rsa') return rsaPkcs1v15Verify(issuerKey, alg.hash, digest, cert.signature);
    const curve = issuerKey.curve === 'p256' ? p256 : p384;
    return curve.verify(cert.signature, digest, issuerKey.point, { prehash: false, lowS: false, format: 'der' });
  } catch {
    return false;
  }
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i]!) ^ (b[i]!);
  return diff === 0;
}
