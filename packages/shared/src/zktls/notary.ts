/**
 * The notary this build trusts (docs/ref/10 §3.6). Verifiers pin the root
 * did:key; the monthly keys and their root-signed certs travel inside each
 * evidence bundle, so rotation never needs an app or web release.
 *
 * DEV ROOT: `apps/notary` is deployed only as `creds-notary-dev`, whose root
 * key was made on a laptop (scripts/keys.ts). Before a public release, the
 * offline YubiKey ceremony produces the production root; replace both values
 * then and redeploy `creds-notary`. Badges witnessed by the dev notary stop
 * verifying at that point — by design, they were never production evidence.
 */
export const CREDS_NOTARY_ORIGIN = 'https://creds-notary-dev.gimmychang.workers.dev';
export const CREDS_NOTARY_ROOTS: readonly string[] = ['did:key:zDnaeTgH77iZ5q57mSeU4g4Juhurj12Dx2y4moivpdaaTvX6Z'];
