# zkTLS production launch — 2026-10-29

## What went live

| Piece | Where |
|---|---|
| Production notary (Worker + Container, Gimmy account) | `https://creds-notary.gimmychang.workers.dev`, version `5aa51d67-274d-45aa-9c4a-1e1733ade7d7`, `REQUIRE_REGISTERED=true` |
| Production root | `did:key:zDnaedMtKbtjzHC8ZEXPVkH86qcTCdhmdCotSJJrnsn3rv9HU` (`apps/notary/keys/production.root`) |
| Monthly keys | 12 (2026-10 → 2027-09), certs in `apps/notary/keys/certs.json`, private keys in the `NOTARY_KEYS` secret |
| Pinned in | `packages/shared` 2.0.5 (`CREDS_NOTARY_ORIGIN`, `CREDS_NOTARY_ROOTS`) — app + web |
| iOS prover | release `zktls-v0.1.0` on p2p-solidarity/creds-app (pre-release), `CredsZktls.xcframework.zip` sha256 `ad67d108863182e33689d98ee3aa9a22771f3a9f1043a9db222abb3011f597c1`, pinned in `apps/expo/scripts/prepare-ios-workspace.sh` |
| Web viewer | creds-web `main` 9c65894 (vendors shared 2.0.5) |

## What was run

- `GET /healthz` → `{"ok":true}`.
- Gate probe with a fresh, unregistered npub (valid NIP-98, WebSocket upgrade) → `403 not_registered`.
- Offline: all 12 keys in the uploaded secret file derive to their did:key and each has a cert in `certs.json` that verifies under the pinned root (12/12).
- Release asset downloaded from the public URL → sha256 matches the pin.
- Web: `bun test` 238 pass, `bun run build` ok; the bundle contains the production root and not the dev root.
- shared zkTLS tests 43 pass; repo typecheck clean.

## Not run

- A full positive proof on production: needs an npub with a registered creds.id name (the gate is on). First real run = the owner verifying a link in the app.
- The app's verify flow on a simulator/device with the release-staged prover.

## Key custody (deviation from plan §3.6)

The root was generated on the dev Mac with `scripts/keys.ts` (Kidney's call, 2026-10-29), not on the offline YubiKey. Monthly keys through 2027-09 are already issued, so the root is not needed until then. **To do:** move `~/.config/creds-notary/production-root.json` to offline storage (+ paper backup) and delete it from this Mac; also delete `production-monthly-2026-10.json` once a copy is kept offline (the Worker secret already holds it).
