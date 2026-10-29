# X profile link field (`x-profile`) — 2026-10-29

Plan: `docs/ref/10-plan-simplify-and-verify.md` §3.10.

## Built
- shared 2.0.7: `x-profile` rule (`platforms.ts`), `xProfile.ts` (un-escape the embedded JS
  string, parse it whole, `core.screen_name` must be the handle, marker only from
  `profile_bio.entities.{description,url}.urls[].expanded_url`), wired into
  `checkEvidenceFacts` and `verifySocialProof`; evidence `revealed` cap 8192. tdd: 15 new tests
  (failure modes first: other account, marker outside the two slots, display-text-only link,
  look-alike names/hosts, range past the string end, truncation, unknown escapes, x-profile
  evidence on a non-X claim).
- prover (`nitro-modules/attest/zktls`): `fieldStopUnescaped` + `fieldContains`, range picking
  in a pure `field_range` with 4 Rust tests. Old requests behave as before.
- App engine: X tries `x-profile` (contains `creds.id/@<name>`), falls back to bio meta + t.co
  when X serves no such payload. Copy: "bio or Website field".
- creds-web: vendors shared 2.0.7 (viewer accepts the new evidence).

## Run (`e2e.log`)
CLI prover (the app's prover crate) → `creds-notary-dev` (redeployed with shared 2.0.7) →
real x.com through the Cloudflare Container → evidence → offline verify with the dev root.

| target | prover picked | revealed | result |
|---|---|---|---|
| x-profile/kidneyweakx, contains `creds.id/@kidneyx` | slim profile payload | 715 B | verified; links `https://creds.id/@kidneyx`; marker ✓ |
| x-profile/kidneyweakx, contains `kidneyweakx.com` | full profile payload | 2196 B | verified; links bio + website field `http://kidneyweakx.com` |
| x/jack, telegram/durov, creds-name/gimmy, gate probes | unchanged paths | — | all OK (no regression) |

Also: the verifier on the three payloads of a saved real page → slim ✓, full ✓, timeline rejected
("another account").

## Not run
- A positive **website-field marker** proof: needs `creds.id/@kidneyx` in the X website field
  (today it holds `kidneyweakx.com`; selection of that slot is proven above).
- The app on a device against the production notary (needs the owner's registered npub).
- Production notary, creds-web deploy and the `zktls-v0.2.0` prover release (held for approval).
