# Passport P1 (docs/ref/11 §6.1) — device-attested passport statement — 2026-10-30

Goal: the passport badge and "N passport witnesses" come from a statement signed by the phone's attested device key after a chip passes passive auth — no circuit, verified the same way by the app and creds.id.

## What changed

- `packages/shared` 2.1.3 — `deviceproof/passport.ts`:
  - `creds.passport` statement `{v, holder, ageOver18, nullifier?, readAt, signedAt}` in a NIP-78 event (`d=creds.passport`, `n=<nullifier>` only when present).
  - `verifyPassportStatement` reuses the witness device-proof check (`verifyDeviceProof`, now exported) and refuses the notary.
  - `passportNullifier(sod)` = SHA-256 over a domain tag and SHA-256(SOD).
  - `countPassportWitnesses`: a nullifier signed by more than one device key is contested and counts for no one (plan 11 Q4, see the deviation recorded there).
- App:
  - `app/passport/index.tsx`: after a real chip (not simulated) passes passive auth, the user is asked whether to be counted as a passport witness (Q3; the body warns that the issuing state can link the account), and the statement is published.
  - `app/_layout.tsx`: re-signs the statement in the background every 30 days until the passport expires. The device key needs no Face ID.
  - `src/passport/npubBinding.ts`: issue, renew and count. `WitnessSection` already calls `countPassportHolders`; it was not edited.
- Web (`airmeishi-web` 45ee4c9):
  - `verifySocialProofs` counts passport witnesses with the same shared code. The count is `null` (shown as "unreachable") when a relay round is unconfirmed.
  - Badge chip shows the count; shared 2.1.3 is vendored.

## What was run

- `packages/shared`: `bun test test/passportStatement.test.ts` → 10 pass. The whole shared suite → 470 pass. Failure modes are listed at the top of the test file; they were written before the code.
- App: `tsc --noEmit` clean; eslint on the touched files shows 0 errors (warnings were already there).
- Web: typecheck, oxlint and `bun test` (238 pass). The dev server rendered `/@kidneyx` in the browser pane. The only console errors were damus websocket failures, a relay flake that predates this change.
- Repo verify (`bun run typecheck && bun run lint && bun run test`): typecheck and lint clean; tests 1584 pass, 6 fail — all six timed out at 5 s while the machine load average was 186–540 (other sessions). Rerun with `--timeout 120000`: i18nCatalog, motionWorklet and iosBuildEnv all pass (20/20).

## Not run (needs hardware this session doesn't have)

- The real flow: two phones on a **TestFlight/App Store build** each scan a passport, opt in, then witness each other's Page. Each should then see "1 passport witness" in the other's app and on creds.id.
  - The simulator can't do App Attest.
  - Dev builds attest in the sandbox environment, which `CREDS_DEVICE_TRUST` (production) rejects by design.
  - No valid device-attested statement for our app ID exists to replay offline: the test fixtures are attested for other apps and other challenges. The unit test checks that such a fixture is refused for our holder.
- Android Key Attestation on a Play-signed build (same reason).

## Known follow-ups

- Deleting the passport credential does not yet clear the stored statement (`passport:statement:v1`). It stops being re-signed only once the passport expires or the npub changes; otherwise it keeps being renewed. Fix together with P2, which reworks the passport credential screens.
- The app's `countPassportHolders` returns 0 when relays fail; the web returns "unreachable". `WitnessSection` belongs to the nostr-progressive session, so the app keeps 0 (the passport pill is simply hidden).
