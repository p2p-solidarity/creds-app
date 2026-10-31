/**
 * RSASSA-PKCS1-v1_5 verification (RFC 8017 §8.2.2) on bigint — Hermes has no
 * WebCrypto, and Google's older attestation roots are RSA-4096.
 *
 * The check rebuilds the whole expected encoding (`00 01 FF… 00 DigestInfo
 * digest`) and compares it byte for byte with `s^e mod n`; the padding is
 * never parsed, so short-padding / trailing-garbage forgeries (Bleichenbacher
 * 2006, e = 3) cannot pass.
 */
export type RsaHash = 'sha256' | 'sha384' | 'sha512';

export interface RsaPublicKey {
  readonly n: bigint;
  readonly e: bigint;
}

const DIGEST_INFO: Readonly<Record<RsaHash, Uint8Array>> = {
  sha256: Uint8Array.from([0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20]),
  sha384: Uint8Array.from([0x30, 0x41, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x02, 0x05, 0x00, 0x04, 0x30]),
  sha512: Uint8Array.from([0x30, 0x51, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x03, 0x05, 0x00, 0x04, 0x40]),
};
const DIGEST_LEN: Readonly<Record<RsaHash, number>> = { sha256: 32, sha384: 48, sha512: 64 };

function bytesToBigint(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = base % mod;
  for (let e = exp; e > 0n; e >>= 1n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
  }
  return result;
}

export function rsaPkcs1v15Verify(key: RsaPublicKey, hash: RsaHash, digest: Uint8Array, signature: Uint8Array): boolean {
  if (digest.length !== DIGEST_LEN[hash] || key.e < 3n || key.n <= 0n) return false;
  const k = Math.ceil(key.n.toString(2).length / 8);
  if (signature.length !== k) return false;
  const s = bytesToBigint(signature);
  if (s >= key.n) return false;

  const info = DIGEST_INFO[hash];
  const padLen = k - 3 - info.length - digest.length;
  if (padLen < 8) return false;
  const expected = new Uint8Array(k);
  expected[1] = 0x01;
  expected.fill(0xff, 2, 2 + padLen);
  expected.set(info, 3 + padLen);
  expected.set(digest, 3 + padLen + info.length);

  let m = modPow(s, key.e, key.n);
  let diff = 0;
  for (let i = k - 1; i >= 0; i--) {
    diff |= Number(m & 0xffn) ^ (expected[i]!);
    m >>= 8n;
  }
  return diff === 0;
}
