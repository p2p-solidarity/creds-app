# Plan — passport expiry century (2026-11-05)

Build under test: Release iOS app already on the `iPhone 18 Pro` sim (2.0.1, native identical to this branch — only Android intent filters differ), with `main.jsbundle` replaced by a Hermes bundle built from this worktree (fix commit). Preflight: bundle contains the new `mrzDate` code (grep the plain JS before hermesc).

Precondition: developer mode on, simulated NFC on; open `solidarity://passport?manual=1`.

| ID | Steps | Expected | Verified at |
|---|---|---|---|
| E1 | Passport no. `X1234567`, nationality `TWN`, birth `19900115`, expiry `20310101` | Expiry field shows `2031/01/01`, birth `1990/01/15` | screenshot of the fields |
| E2 | Tap Continue | NFC step opens, no "Passport appears to be expired." | screenshot |
| E3 | Back, expiry `20250101`, Continue | Error "Passport appears to be expired." (negative path still works) | screenshot |
| O1 | Type expiry one digit per input event | Field accumulates digits (observation of the controlled field, not part of the fix) | screenshot |

Stop at the NFC step: no credential is saved, nothing is published. Cleanup: `xcrun simctl shutdown all`.
