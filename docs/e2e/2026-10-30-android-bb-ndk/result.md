# Android passport prover on passport-noir 0.4.0 — 2026-10-30

Goal: Android shipped a 0.3.0 `libpassport_zk_mopro.so` (no NDK-built
barretenberg on this machine), so the 0.4.0 app could not prove. Rebuild it and
decide whether to upgrade barretenberg.

## bb upgrade research (decision: stay on 4.2.0-aztecnr-rc.2, build from source)

| Question | Finding |
|---|---|
| Does barretenberg-rs 6.0.0 fix Android? | No. Its `arm64-android` prebuilt is still `zig c++` output: 144 `std::__1` symbols undefined, 0 `__ndk1`. NDK `libc++_shared.so` exports only `__ndk1`. |
| Why did 4.2.0 fail before? | Two layers: its `build.rs` maps `aarch64-linux-android` to the **Linux** archive (the `linux` arm matches first; 6.0.0 reorders), and the real Android archive is also zig/`__1` (140 undefined). |
| Upgrade cost | bb 6.x needs a newer Noir than `zkmopro/noir-rs` v1.0.0-beta.19 (its latest tag), recompiled circuits, new vk pins on both platforms. No Android benefit. |
| Fix | `nitro-modules/attest/scripts/build-bb-android.sh`: plain NDK toolchain configure of target `bb-external` at the same tag. ~6 min per ABI. Result: 0 `std::__1`, ~19.5k `__ndk1` refs. |

## Run on Android (arm64 emulator, API 34, 6 GB)

- The crate's own `#[ignore]` e2e test, cross-compiled with `cargo ndk` against
  the NDK bb lib and run on the emulator: dsc_chain, passport_adapter and
  0.4.0 openac_show (global nullifier) each **prove and verify** — 71 s total,
  peak 749 MiB (`android-prove.log`).
- `vk_sha256` on the emulator for openac_show:
  `bc03240fa4c03c70623f4fb01236e32fc252ff7c40825edae50ba57f2fde7218` — equal
  to the app's build pin (`showWitnessVault.ts`), so Android proofs match iOS.
- Shipped `.so` (both ABIs): all 131 C++ symbols it imports are exported by the
  bundled `libc++_shared.so` (0 missing) — the old `UnsatisfiedLinkError`
  cannot recur. The debug APK carries the 0.4.0 build (strings: `0.4.0`,
  nullifier scope; the replaced one said `0.3.0`).
- Dev client built, installed and booted to onboarding on the emulator
  (`android-emulator-boot.png`).

## Also fixed

- `build-android.sh` wiped `jniLibs/*`, deleting the gitignored semaphore and
  circom `.so` files built elsewhere; it now replaces only its own libs.
- Android circuit cache (`extractAsset`) was keyed on size only; a same-size
  circuit change would keep the old circuit after an update. It now also
  requires the copy to be newer than the installed APK.

## Not verified

- A proof from inside the app on Android (needs a real passport over NFC; the
  emulator has none, and Metro's inspector refused a scripted
  `Runtime.evaluate`). The prover itself is proven on Android above.
- A physical Android device; x86_64 `.so` only checked by symbols, not run.

## iOS "無法完成身分設定 / storageFailed: Could not load bundle"

Not an app bug: the dev build loads `import()` chunks lazily from Metro
(`lazy=true`), and Metro had been stopped. With Metro running the same step
completes (onboarding advanced to 「放上你的連結」). Release builds have no lazy
chunks.

## Release + deploy (same day)

- passport-noir v0.4.0 cut by the release workflow; `PassportMoproBindings.xcframework.zip`
  SHA `f397c013…f49e` (contains the 0.4.0 witness builder), `passport.srs.bin`
  uploaded and re-downloaded at the pinned `7d368f93…6996`.
- `prepare-ios-workspace.sh` downloaded and SHA-checked the released zip (local
  build moved aside); the simulator app built on it and runs
  (`ios-sim-release-xcframework.png`). `expo run:ios` needs `--scheme solidarity`
  (the shared scheme is lowercase for Xcode Cloud).
