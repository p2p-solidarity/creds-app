# Passport P3 (docs/ref/11 §6.2) — passport-noir 0.5.0 — 2026-10-30

**Goal.** One circuit that checks the chip's real ICAO bytes, plus a verifier that trusts only pinned CSCAs. Then passport-noir graduates.

## What changed (passport-noir `f724fc3`, `9f2a0ad`, `0dfb066`, `84cf45e`, tag `v0.5.0`)

- **`circuits/passport_mrz`.** One circuit replaces the three-proof passport path. It checks:
  1. The DSC's RSA-2048 PKCS#1 v1.5 SHA-256 signature over the DER SignedAttributes (tag 0x31).
  2. messageDigest = SHA-256(eContent).
  3. The DataGroupHash for DG1 in the LDSSecurityObject = SHA-256(DG1).
  4. A P-256 device signature over the verifier's challenge, giving a per-scope device tag.
  5. Not expired; age ≥ N and nationality, read from the endorsed DG1.
  6. Nullifier = pedersen(H(eContent), scope); scope 0 → 0.
  - The DSC modulus is a public input.
  - Gates: 10,789 ACIR opcodes, dyadic size 2¹⁸.
- **`mopro-binding/src/passport_mrz.rs`:**
  - `build_passport_mrz_witness` fails closed with reason codes.
  - `prove_passport_mrz` uses a 1× SRS.
  - `verify_passport_mrz`:
    - DSC → pinned CSCA list (subject = issuer, AKI/SKI, signature via ring). Allowed: RSA PKCS#1 v1.5 with SHA-256/384/512, and ECDSA P-256/P-384.
    - Validity at `now`, revocation, modulus equals the public input, request equals the public inputs.
    - The vk is derived from the released circuit JSON, not taken from the prover.
- **Retired:** `build_open_ac_v3_witness_bundle` always returns `ready=false, reason=retired-not-issuer-bound`. `attestation.rs`, `trust.rs`, `pedersen.rs` and the old `sod.rs`/`fixtures.rs` are deleted.
- **Other:**
  - `gen_srs --exact`, `make gen-srs-mrz`.
  - `SECURITY.md` advisory: proofs from ≤ 0.4.0 are not bound to an issuing state.
  - README / CLAUDE.md graduation status.
  - The release workflow attaches `passport_mrz.json` and commits the regenerated `mopro.swift`.

## What was run

- `nargo test --package passport_mrz` → 6 pass. `make lint` → pass (score 71, C). `make spec-check` → pass.
- `cargo test --lib` (debug, whole crate) → 73 pass, 12 ignored.
- **Real proofs.** `cargo test --release --lib passport_mrz -- --include-ignored` → 11 pass in 96 s, while the machine load average was 180+. Fixture: synthetic ICAO chip — a test CSCA issues a DSC, the DSC signs the SOD.
  - A genuine proof verifies against the pinned test CSCA: `age_ok`, `TWN`, non-zero nullifier and tag.
  - The same proof with an empty trust list → refused.
  - Flip one bit of the nullifier public input → barretenberg "verification failed at reduction step".
  - A DG1 the DSC never signed → the proof cannot be generated.
  - Quiet mode (no scope, no disclosure) verifies with zero outputs.
- **SRS:** `passport_mrz.srs.bin` at 1× = 16,777,428 B (2¹⁸ points). The old merged `passport.srs.bin` was 134,217,940 B. The prover still peaked at about 442 MiB.
- **Unit tests (no SRS needed), one per failure mode:**
  - A forged DSC under the CSCA's name but signed by another key → `dsc-not-issued-by-pinned-csca`.
  - Also covered: expired, revoked, other modulus, each request field, wrong public-input count, tampered DG1, signature from the wrong key, eContent swapped under a genuine signature, device signature over another challenge.

## Not run

- **No real passport.** The TW/JP chip survey (which DSC algorithms states actually use) was not done. The circuit supports only RSA-2048 / e = 65537 / SHA-256; anything else fails with a reason code. For example, a German brainpool DSC will not work.
- **No proof on an iPhone.** The new xcframework is built by CI from the tag.
- **No ICAO Master List shipped or tested.** The verifier takes whatever CSCA list the caller pins.
