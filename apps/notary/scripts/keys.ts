/**
 * Notary key ceremony (docs/ref/10 §3.6) for one environment:
 *
 *   bun scripts/keys.ts root  <env>                      new root key
 *   bun scripts/keys.ts issue <env> <YYYY-MM> <months>   monthly keys + root-signed certs
 *
 * Private keys never enter the repo: they live in ~/.config/creds-notary/
 * (mode 600) and the monthly ones go to the Worker as the NOTARY_KEYS secret.
 * Only public data is written here: keys/<env>.root (the root did:key that
 * verifiers pin) and keys/certs.json (every issued cert, all environments).
 * Production's root is meant to be made on the offline machine with the
 * YubiKey, not on a laptop with this script.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { p256 } from '@noble/curves/nist.js';
import { bytesToHex, didKeyFromPublicKey, generateP256KeyPair, hexToBytes, publicKeyFromPrivate } from '@solidarity/shared';
import { signNotaryCert } from '@solidarity/shared/zktls';

const SECRET_DIR = join(homedir(), '.config', 'creds-notary');
const KEYS_DIR = join(import.meta.dir, '..', 'keys');
const CERTS = join(KEYS_DIR, 'certs.json');

function writeSecret(file: string, data: unknown): void {
  mkdirSync(SECRET_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
}

function signerFor(privateKey: Uint8Array) {
  return async (digest: Uint8Array) => p256.sign(digest, privateKey, { prehash: false });
}

const [cmd, env, start, months] = process.argv.slice(2);
if (!env || !/^[a-z]+$/u.test(env)) throw new Error('usage: keys.ts root|issue <env> [YYYY-MM months]');
const rootFile = join(SECRET_DIR, `${env}-root.json`);

if (cmd === 'root') {
  if (existsSync(rootFile)) throw new Error(`${rootFile} exists; refusing to replace a root key`);
  const pair = generateP256KeyPair();
  const did = didKeyFromPublicKey(pair.publicKey);
  writeSecret(rootFile, { did, privateKeyHex: bytesToHex(pair.privateKey) });
  writeFileSync(join(KEYS_DIR, `${env}.root`), `${did}\n`);
  console.log(`root ${did}\nprivate key → ${rootFile}`);
} else if (cmd === 'issue') {
  const match = /^(\d{4})-(\d{2})$/u.exec(start ?? '');
  const count = Number(months);
  if (!match || !Number.isInteger(count) || count < 1 || count > 12) throw new Error('issue needs <YYYY-MM> <1..12>');
  const root = JSON.parse(readFileSync(rootFile, 'utf8')) as { did: string; privateKeyHex: string };
  const rootKey = hexToBytes(root.privateKeyHex);
  if (didKeyFromPublicKey(publicKeyFromPrivate(rootKey)) !== root.did) throw new Error('root key file is inconsistent');

  const certs: string[] = existsSync(CERTS) ? (JSON.parse(readFileSync(CERTS, 'utf8')) as string[]) : [];
  const secret: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const nbf = Date.UTC(Number(match[1]), Number(match[2]) - 1 + i, 1) / 1000;
    const exp = Date.UTC(Number(match[1]), Number(match[2]) + i, 1) / 1000 - 1;
    const pair = generateP256KeyPair();
    const keyDid = didKeyFromPublicKey(pair.publicKey);
    certs.push(await signNotaryCert({ keyDid, nbf, exp }, root.did, signerFor(rootKey)));
    secret[keyDid] = bytesToHex(pair.privateKey);
    console.log(`${new Date(nbf * 1000).toISOString().slice(0, 7)}  ${keyDid}`);
  }
  writeFileSync(CERTS, `${JSON.stringify(certs, null, 2)}\n`);
  const secretFile = join(SECRET_DIR, `${env}-monthly-${start}.json`);
  writeSecret(secretFile, secret);
  console.log(`certs → keys/certs.json\nprivate keys → ${secretFile}`);
  console.log(`upload: bunx wrangler@4.155.0 secret put NOTARY_KEYS${env === 'production' ? '' : ` --env ${env}`} < ${secretFile}`);
} else {
  throw new Error('usage: keys.ts root|issue <env> [YYYY-MM months]');
}
