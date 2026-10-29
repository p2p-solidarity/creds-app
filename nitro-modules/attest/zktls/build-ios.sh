#!/bin/sh
# Builds CredsZktls.xcframework (device + Apple-silicon simulator) from this crate.
# Output is gitignored; Xcode Cloud stages a SHA-pinned copy (see apps/expo/ci-scripts).
set -eu
cd "$(dirname "$0")"
TOOLCHAIN=+1.95.0
export IPHONEOS_DEPLOYMENT_TARGET=17.0
for t in aarch64-apple-ios aarch64-apple-ios-sim; do
  rustup $TOOLCHAIN target add "$t" >/dev/null
  cargo $TOOLCHAIN build --release --lib --target "$t"
done
rm -rf CredsZktls.xcframework
xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libcreds_zktls.a -headers include \
  -library target/aarch64-apple-ios-sim/release/libcreds_zktls.a -headers include \
  -output CredsZktls.xcframework

# The CI artifact: attach this zip to an airmeishi release and pin its SHA in
# apps/expo/scripts/prepare-ios-workspace.sh (AIRMEISHI_ZKTLS_SHA256).
rm -f CredsZktls.xcframework.zip
ditto -c -k --keepParent CredsZktls.xcframework CredsZktls.xcframework.zip
shasum -a 256 CredsZktls.xcframework.zip
