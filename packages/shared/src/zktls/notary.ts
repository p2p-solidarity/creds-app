/**
 * The notary this build trusts (docs/ref/10 §3.6). Verifiers pin the root
 * did:key; the monthly keys and their root-signed certs travel inside each
 * evidence bundle, so rotation never needs an app or web release.
 *
 * Production root, made 2026-10-29 with scripts/keys.ts and moved offline
 * afterwards (its 12 monthly keys, 2026-10 to 2027-09, were issued first).
 * Badges witnessed by the dev notary do not verify here — by design, they
 * were never production evidence.
 */
export const CREDS_NOTARY_ORIGIN = 'https://creds-notary.gimmychang.workers.dev';
export const CREDS_NOTARY_ROOTS: readonly string[] = ['did:key:zDnaedMtKbtjzHC8ZEXPVkH86qcTCdhmdCotSJJrnsn3rv9HU'];
