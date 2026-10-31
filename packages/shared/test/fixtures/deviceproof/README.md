# Device-attestation fixtures (docs/ref/10 §3.11)

Real, public test vectors — the expected values in the tests come from these sources, not from our code.

- `android/` — from [android/keyattestation](https://github.com/android/keyattestation) `testdata/` (Apache-2.0).
  Each `.pem` is a real chain (leaf first) and the `.json` beside it is Google's own parse of its KeyDescription.
  `tags_not_in_ascending_order.pem` and `malformed_rot_device_locked.pem` are Google's invalid samples.
  Renamed `<device>_<sdk>_<name>`; `//` comment lines were dropped so the JSON parses.
- `appattest/` — from [uebelack/node-app-attest](https://github.com/uebelack/node-app-attest) `test/fixtures/` (MIT):
  App Attest attestation objects (development + production) for app ID `V8H6LQ9448.io.uebelacker.AppAttestExample`.
  The assertion vector in `deviceProof.test.ts` is from the same repo's `test/verifyAssertion.test.js`.

Leaf and RKP certificates are short-lived; tests verify at a time inside each chain's window.
