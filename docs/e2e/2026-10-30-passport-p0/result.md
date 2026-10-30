# Passport ZK P0 (docs/ref/11) — 2026-10-30

Goal: no passport show presentation or npub binding may count as issuer-verified, because `openac_show` checks no issuer signature (plan 11 §1–§2).

## What changed

- `apps/expo/src/passport/showVerifier.ts`: a presentation that passes every check (vk pin, public inputs, scope, nonce, date, native proof) now returns `issuer-unbound` instead of `ok`. This is the single verifier behind the sqc1 scan route and the npub binding.
- `apps/expo/src/passport/npubBinding.ts`: publishing and verifying bindings removed; `countPassportHolders` returns 0 (no binding can be trusted). `app/passport/index.tsx` no longer publishes a binding after enrollment.
- Regression test (real bug): `passportShowVerifier.test.ts` — a fully verifying presentation is refused as `issuer-unbound`; routing and time-bucket tests updated to match.

## E2E run (CLI, real proof bytes, the app's own TS verifier)

Setup (scratchpad only, nothing committed): an `openac_show` proof generated from made-up passport data with the shipped `openac_show.json` and `passport.srs.bin`; the native `verifyNoirProof` replaced by the same barretenberg verifier (`passport_zk_mopro::verify_noir_proof`) run out of process. The verifier modules are the real `apps/expo/src/passport/showVerifier.ts` (worktree, after P0) and the same file from `HEAD` (before P0).

```
extract (app parser, raw bytes)  = null
4-byte prefix = 0,0,0,51
envelope vk sha256  = bc03240fa4c03c70623f4fb01236e32fc252ff7c40825edae50ba57f2fde7218   (= app build pin)
before P0 (HEAD)    = {"ok":false,"reason":"malformed-public-inputs"}
after P0 (worktree) = {"ok":false,"reason":"malformed-public-inputs"}
--- parser-aligned (envelope carries proof without the count prefix) ---
before P0 (HEAD)    = {"ok":true, ...}        ← forged passport accepted
after P0 (worktree) = {"ok":false,"reason":"issuer-unbound"}
```

Finding along the way (plan 11 §2.4): mopro proof bytes start with a 4-byte public-input count; the app's parser ignores it, so every real proof — genuine or forged — has always been rejected as `malformed-public-inputs`. The forgery was masked by that bug, not by design. Not fixed: P2 removes the passport ZK verifier; the `issuer-unbound` gate keeps a future parser fix from opening the hole.

## Not run

- Simulator / device UI: P0 has no visible difference — the scan route already showed 「出示遭拒絕」 (via the parse bug) and the witness section only shows the passport pill when the count is > 0.
- 0.3.x proofs from the 1.3.3 build: assumed to carry the same prefix (same noir-rs `v1.0.0-beta.19`), not measured.
