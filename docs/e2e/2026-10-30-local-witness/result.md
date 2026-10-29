# 2026-10-30 — local-first verification (docs/ref/10 §3.11), phases 1–7

## Ran for real
| What | How | Result |
|---|---|---|
| Device-attestation verifiers | `packages/shared` bun test, real Apple App Attest + Google RSA/EC/RKP chains (fixtures/deviceproof) | pass |
| Local page check (tier 4) | `tier4.log`: shared `checkSocialMarker` against live x.com / github.com / t.me | X `creds.id/@kidneyx` found in 0.6 s; wrong name, GitHub without marker, Telegram without marker → `markerMissing` |
| Witness read from relays | same run: damus / nos.lol / primal, `#d = creds.witness:x:@kidneyweakx:<hex>` | 0 events (none published yet), summary empty |
| creds.id viewer | vite dev, `/@kidneyx` | X claim reads 已宣稱 (no witness yet, old notary proofs no longer count); attestation-status requested; no console errors |
| passport-noir circuit | `nargo test` openac_core + openac_show | 123 pass (nullifier: honest, forged, zero-scope, value-without-scope) |
| mopro Rust | `cargo test --release --lib` | 101 pass; iOS xcframework rebuilt (v0.4.0) |
| openac_show vk pin | `cargo run --example vk_sha256` | `bc03240f…7218` (pinned in app) |
| Pro license | backend bun test + cross-verify backend-minted JWS with shared `verifyProLicense` | pass |
| Notary worker | `wrangler deploy --dry-run` | bundles (959 KiB) |
| Repo verify | `bun run typecheck && bun run lint && bun run test` | 0 errors; unit 1590 / parity 78 pass |
| iOS dev client | `expo run:ios` on iPhone 18 Pro simulator | builds and launches |

## Not run (needs hardware, secrets or a release)
- App Attest / Android Key Attestation on a real device: no device was connected; simulators have no App Attest. No positive witness has ever been produced end to end.
- Viewer "幫他見證" tap → publish → web count: needs two real phones.
- Passport enrollment → npub binding → nullifier count: needs a real passport + device.
- Android mopro `.so` with the nullifier: needs the local bb-fork (NDK barretenberg) — not on this machine.
- Pro license against App Store / Play: store secrets (09-plan A11/A12/P7/P8) not provisioned; license + notary witness keys not generated; `CREDS_LICENSE_ISSUERS` and `CREDS_NOTARY_WITNESS_PUBKEYS` are empty, so both fail closed.
- Deploys: creds-notary, solidarity-id (+ D1 migration 0004), creds-web; passport-noir v0.4.0 release with `PassportMoproBindings.xcframework.zip` (local SHA `771f2117…f7e`) and `passport.srs.bin` (unchanged, `7d368f93…6996`).
