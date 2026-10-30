# Passport passive auth: require the SOD signature and DG1 (2026-10-31)

## Bug
iOS `passiveAuthValid = passportCorrectlySigned && passportDataNotTampered`.
In NFCPassportReader (Pods/NFCPassportReader/.../NFCPassportModel.swift):
- `passportCorrectlySigned` = the SOD's first certificate chains to a CSCA in
  `masterList.pem`. It does not check the SOD signature.
- `ensureReadDataNotBeenTamperedWith` verifies the signature into
  `documentSigningCertificateVerified`, but on failure it catches the error and
  compares DG hashes against the *unsigned* encapsulated content, so
  `passportDataNotTampered` can still be true.

Forgery (no root, no real passport): copy any genuine Document Signer cert
(public, in every passport's SOD), write a DG1 with any date of birth, put its
hash in the SOD, garbage signature, emulate the chip (Android HCE + BAC). The
genuine app on iOS said passive auth passed → L3, `ageOver18`, and a fresh
nullifier per fake SOD (inflates the distinct-passport count).

Android (jmrtd + BouncyCastle) already verified the CMS signature with the same
signer cert it chain-checks; it only skipped DG1 when the DG or its SOD hash was
missing.

## Fix
- iOS `nitro-modules/attest/ios/HybridNfcPassport.swift`: also require
  `documentSigningCertificateVerified` and `dataGroupHashes[.DG1]?.match`.
  The signature key and the chain check both use the SOD's first certificate
  (`SOD.getPublicKey` / `getX509CertificatesFromPKCS7(...).first`), so the
  verified signer is the chained signer. Diagnostics log line now prints
  `chain= sodSig= dg1Hash=`.
- Android `HybridNfcPassport.kt`: DG1 bytes and its SOD hash are mandatory.

## Run
- iOS: `xcodebuild -project Pods/Pods.xcodeproj -scheme Attest -sdk iphoneos` → BUILD SUCCEEDED.
- Android: `./gradlew :solidarity_nitro-attest:compileDebugKotlin` → BUILD SUCCESSFUL.

## Not run
- A real passport read on a device with this build (needs a native build on the
  XR; expect `[nfc] read-diagnostics ... passiveAuthValid=true chain=true sodSig=true dg1Hash=true`).
- A forged-SOD chip (no HCE emulator here) — the rejection is from reading the code.
- Statements signed by earlier iOS builds stay valid until they lapse
  (`WITNESS_LAPSE_SECONDS`); there is no way to tell a forged one from a real one.
- Still open: cloned chips (passive auth cannot detect a copy; Active/Chip
  Authentication is logged, not enforced), and `ageOver18` does not need the
  nullifier, so one adult passport can mark unlimited npubs.
