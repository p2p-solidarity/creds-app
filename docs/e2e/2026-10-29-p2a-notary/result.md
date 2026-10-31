# P2a — evidence chain + notary service — 2026-10-29

Plan: `docs/ref/10-plan-simplify-and-verify.md` §3.1, §3.5–3.9, §7 P2.

## What was built
- `packages/shared/src/zktls/`: platform rules (`platforms.ts`), notary evidence/cert JWS +
  offline verifier (`evidence.ts`), the notary's NIP-98 request gate (`request.ts`). tdd, 30 tests
  (`test/zktlsEvidence.test.ts`, `test/zktlsRequest.test.ts`): failure modes listed first, then green.
- `apps/notary/`: the Worker + Durable Object (`src/worker.ts`: gate, replay set, 20/h per npub,
  creds.id registration check, signs with the current month's key) and the Container's Rust
  verifier (`container/src/bin/notary.rs`: refuses another server, private addresses, more than one
  request, a partly hidden request, more than one revealed range, responses over 2 MiB; holds no
  keys). Dev CLI prover `container/src/bin/prove.rs`, driver `scripts/e2e.ts`.
- Key tool `scripts/keys.ts`: dev root + 12 monthly keys (2026-10 → 2027-09). Private keys are
  only in `~/.config/creds-notary/` (mode 600) and the `NOTARY_KEYS` Worker secret. Public:
  `keys/dev.root`, `keys/certs.json`.

## Deployed
`creds-notary-dev` on Gimmy's account (b9e6…), `https://creds-notary-dev.gimmychang.workers.dev`,
Container `standard-1`. The `dev` env **skips the creds.id registration check**
(`REQUIRE_REGISTERED=false`), because the E2E uses a throwaway npub. Production
(`creds-notary`) is configured but **not deployed**: it waits for the offline root ceremony
(§3.6) and a pinned production root in shared.

## E2E run (`e2e.log`)
CLI prover on this Mac → deployed notary → evidence pickup → offline `verifyNotaryBundle` with the
pinned dev root.

| target | total | prover | response | revealed | bundle | offline verify |
|---|---|---|---|---|---|---|
| x.com/jack | 5.7 s (14.2 s cold container) | 5.1 s | 186 KB | 60 B (bio meta) | 976 B | ✓ |
| t.me/durov | 5.2 s | 4.7 s | 11 KB | 61 B (og:description) | 988 B | ✓ |
| creds.id nostr.json?name=gimmy (name evidence) | 4.6 s | 4.4 s | 1 KB | 82 B (name → pubkey) | 1064 B | ✓ |

Live gate probes:
- a replayed session header → `401 replayed` ✓
- evidence pickup by another npub before the owner picks it up → `404` ✓
- the prover signs a session for `x/jack` but connects to `t.me` → the session is dropped, evidence
  `422 not_witnessed` ✓

Timings are slower than the P0 spike (2–4.6 s) because each run here also pays two NIP-98 round
trips and the evidence pickup; not yet profiled.

## Not verified / not done
- No phone: the prover is the Mac CLI. Prover performance on a device and app size are P2b.
- The X marker check end to end (bio → t.co → `creds.id/@name`) is not run here; `x-link` (t.co)
  rule is unit-tested only. jack's bio has no marker, so this run proves only the bio bytes.
- The npub ↔ DID binding event and the Page check (§3.5 steps 3–4) are not built yet.
- The registration check (`REQUIRE_REGISTERED=true`) has never run live.
- Revocation list publishing; the verifier accepts a `revoked` set but nothing publishes one yet.
