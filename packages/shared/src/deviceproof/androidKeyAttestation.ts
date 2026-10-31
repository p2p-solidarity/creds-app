/**
 * Android Key Attestation (docs/ref/10 §3.11; developer.android.com "Verify
 * hardware-backed key pairs with key attestation"), verified offline against
 * Google's pinned roots.
 *
 * Policy, all required: hardware-backed key (TEE or StrongBox), a locked
 * bootloader with verified boot, our package name and app-signing digest, the
 * challenge the app was given, no revoked certificate. The KeyDescription is
 * trusted only on the leaf: a key that may sign can extend a real chain with
 * a forged extension below itself, so a KeyDescription anywhere else fails.
 *
 * Validity windows are enforced on Remote-Key-Provisioned chains (they carry
 * the provisioning-info extension and are short-lived by design); Google asks
 * verifiers to keep trusting factory-provisioned chains past their dates.
 */
import { err, ok, type Result } from '../types/result';
import { verifyCertChain } from './chain';
import { DER, derBoolean, derChildren, derExpect, derInteger, derOctets, derParse, type DerNode } from './der';
import { equalBytes, type PublicKeyInfo } from './x509';

const OID_KEY_DESCRIPTION = '1.3.6.1.4.1.11129.2.1.17';
const OID_PROVISIONING_INFO = '1.3.6.1.4.1.11129.2.1.30';
const TAG_ROOT_OF_TRUST = 704;
const TAG_ATTESTATION_APPLICATION_ID = 709;
const SECURITY_LEVELS = { 1: 'TrustedEnvironment', 2: 'StrongBox' } as const;
const VERIFIED_BOOT_VERIFIED = 0n;

export type AndroidSecurityLevel = (typeof SECURITY_LEVELS)[keyof typeof SECURITY_LEVELS];

export interface AndroidKeyAttestationInput {
  /** Leaf first, root last — `KeyStore.getCertificateChain()`. */
  readonly chain: readonly Uint8Array[];
  /** What the app passed to `setAttestationChallenge`. */
  readonly challenge: Uint8Array;
  readonly packageName: string;
  /** SHA-256 of the app's signing certificate(s) — for a Play build, the Play app-signing key. */
  readonly signatureDigests: readonly Uint8Array[];
  /** Pinned Google attestation roots, DER. */
  readonly roots: readonly Uint8Array[];
  /** When the attestation is claimed to have been made (unix ms). */
  readonly at: number;
  /** Lowercase-hex serials from Google's attestation status list. */
  readonly revokedSerials?: ReadonlySet<string>;
}

export interface AndroidKeyAttestation {
  /** The attested key (the leaf's). */
  readonly publicKey: PublicKeyInfo;
  readonly securityLevel: AndroidSecurityLevel;
}

/** Explicitly tagged AuthorizationList entries, in strictly ascending tag order (DER). */
function authorizationList(node: DerNode | undefined): Map<number, DerNode> {
  const entries = new Map<number, DerNode>();
  let last = -1;
  for (const entry of derChildren(derExpect(node, DER.SEQUENCE))) {
    if (entry.cls !== 2 || entry.tag <= last) throw new Error('authorization list tags out of order');
    last = entry.tag;
    const inner = derChildren(entry);
    if (inner.length !== 1) throw new Error('bad authorization entry');
    entries.set(entry.tag, inner[0]!);
  }
  return entries;
}

interface KeyDescription {
  readonly attestationSecurityLevel: bigint;
  readonly keyMintSecurityLevel: bigint;
  readonly challenge: Uint8Array;
  readonly deviceLocked: boolean;
  readonly verifiedBootState: bigint;
  readonly packageNames: readonly string[];
  readonly signatureDigests: readonly Uint8Array[];
}

function parseKeyDescription(value: Uint8Array): KeyDescription {
  const f = derChildren(derExpect(derParse(value), DER.SEQUENCE));
  const software = authorizationList(f[6]);
  const hardware = authorizationList(f[7]);

  const rot = hardware.get(TAG_ROOT_OF_TRUST);
  if (rot === undefined) throw new Error('no hardware root of trust');
  const [, locked, state] = derChildren(derExpect(rot, DER.SEQUENCE));

  const appIdNode = software.get(TAG_ATTESTATION_APPLICATION_ID) ?? hardware.get(TAG_ATTESTATION_APPLICATION_ID);
  if (appIdNode === undefined) throw new Error('no attestation application id');
  const [packages, digests] = derChildren(derExpect(derParse(derOctets(appIdNode)), DER.SEQUENCE));
  const decoder = new TextDecoder();
  return {
    attestationSecurityLevel: derInteger(f[1], DER.ENUMERATED),
    keyMintSecurityLevel: derInteger(f[3], DER.ENUMERATED),
    challenge: derOctets(f[4]),
    deviceLocked: derBoolean(locked),
    verifiedBootState: derInteger(state, DER.ENUMERATED),
    packageNames: derChildren(derExpect(packages, DER.SET)).map((p) => decoder.decode(derOctets(derChildren(derExpect(p, DER.SEQUENCE))[0]))),
    signatureDigests: derChildren(derExpect(digests, DER.SET)).map(derOctets),
  };
}

export function verifyAndroidKeyAttestation(input: AndroidKeyAttestationInput): Result<AndroidKeyAttestation, string> {
  const chain = verifyCertChain(input.chain, { roots: input.roots, at: null });
  if (!chain.ok) return chain;
  const certs = chain.value;

  const revoked = certs.find((c) => input.revokedSerials?.has(c.serial));
  if (revoked !== undefined) return err(`certificate ${revoked.serial} is revoked`);

  const provisioned = certs.findIndex((c) => c.extensions.has(OID_PROVISIONING_INFO));
  if (provisioned >= 0) {
    if (provisioned !== 1) return err('provisioning info is not directly above the leaf');
    const timed = verifyCertChain(input.chain, { roots: input.roots, at: input.at });
    if (!timed.ok) return timed;
  }

  const holders = certs.flatMap((c, i) => (c.extensions.has(OID_KEY_DESCRIPTION) ? [i] : []));
  if (holders.length !== 1 || holders[0] !== 0) return err('KeyDescription must be on the leaf only');
  const leaf = certs[0];
  const raw = leaf?.extensions.get(OID_KEY_DESCRIPTION);
  if (leaf === undefined || raw === undefined) return err('no KeyDescription');

  let kd: KeyDescription;
  try {
    kd = parseKeyDescription(raw);
  } catch (e) {
    return err(`malformed KeyDescription: ${e instanceof Error ? e.message : 'unknown'}`);
  }

  const level = SECURITY_LEVELS[Number(kd.attestationSecurityLevel) as 1 | 2];
  if (level === undefined || kd.keyMintSecurityLevel !== kd.attestationSecurityLevel) return err('key is not hardware-backed');
  if (!equalBytes(kd.challenge, input.challenge)) return err('challenge does not match');
  if (!kd.deviceLocked || kd.verifiedBootState !== VERIFIED_BOOT_VERIFIED) return err('device boot is unlocked or unverified');
  if (!kd.packageNames.includes(input.packageName)) return err('attested app is another package');
  if (!kd.signatureDigests.some((d) => input.signatureDigests.some((pin) => equalBytes(d, pin)))) {
    return err('attested app is signed by another key');
  }
  return ok({ publicKey: leaf.key, securityLevel: level });
}
