/**
 * Certificate chain verification to pinned roots. The chain is leaf first and
 * may or may not include the root (Android does, App Attest's x5c does not).
 * Roots are matched by public key (SPKI), so a re-issued root certificate
 * with the same key — Google's RSA root exists in four issues — is the same
 * anchor, and the anchor's own validity dates are not checked.
 */
import { err, ok, type Result } from '../types/result';
import { equalBytes, isSignedBy, parseCertificate, type Certificate } from './x509';

export interface ChainOptions {
  /** Root certificates (DER) whose public keys are trusted. */
  readonly roots: readonly Uint8Array[];
  /** Check every non-anchor certificate's validity at this time (unix ms); `null` skips it. */
  readonly at: number | null;
}

function parseAll(ders: readonly Uint8Array[]): Result<Certificate[], string> {
  try {
    return ok(ders.map(parseCertificate));
  } catch {
    return err('malformed certificate');
  }
}

export function verifyCertChain(chain: readonly Uint8Array[], opts: ChainOptions): Result<readonly Certificate[], string> {
  if (chain.length === 0) return err('empty chain');
  const certs = parseAll(chain);
  if (!certs.ok) return certs;
  const roots = parseAll(opts.roots);
  if (!roots.ok) return err('malformed root');

  const list = certs.value;
  for (let i = 0; i + 1 < list.length; i++) {
    const cert = list[i]!;
    const issuer = list[i + 1]!;
    if (!equalBytes(cert.issuer, issuer.subject)) return err(`certificate ${i}: issuer name does not match`);
    if (!issuer.isCA) return err(`certificate ${i + 1}: not a CA`);
    if (!isSignedBy(cert, issuer.key)) return err(`certificate ${i}: signature does not verify`);
  }

  const last = list[list.length - 1]!;
  const lastIsAnchor = roots.value.some((r) => equalBytes(r.spki, last.spki));
  if (!lastIsAnchor) {
    const anchor = roots.value.find((r) => equalBytes(r.subject, last.issuer) && isSignedBy(last, r.key));
    if (anchor === undefined) return err('chain does not end at a trusted root');
  }

  if (opts.at !== null) {
    const at = opts.at;
    const checked = lastIsAnchor ? list.slice(0, -1) : list;
    const outside = checked.findIndex((c) => at < c.notBefore || at > c.notAfter);
    if (outside >= 0) return err(`certificate ${outside}: outside its validity window`);
  }
  return ok(list);
}
