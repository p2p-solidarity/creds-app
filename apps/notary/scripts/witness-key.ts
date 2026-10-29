/**
 * Make the Pro notary's witness key (docs/ref/10 §3.11).
 *
 *   bun scripts/witness-key.ts | bunx wrangler@4.155.0 secret put NOTARY_NSEC
 *
 * The secret goes straight into the Worker; this prints only the scalar on
 * stdout (for the pipe) and the public key on stderr. Pin that hex pubkey in
 * packages/shared/src/deviceproof/trust.ts (CREDS_NOTARY_WITNESS_PUBKEYS) —
 * until it is pinned no notary witness counts.
 */
import { schnorr } from '@noble/curves/secp256k1.js';

const scalar = schnorr.utils.randomSecretKey();
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
console.error(`notary witness pubkey (pin this): ${hex(schnorr.getPublicKey(scalar))}`);
process.stdout.write(hex(scalar));
