#!/usr/bin/env bash
# Build barretenberg's bb-external static lib with NDK clang so it references
# libc++ as std::__ndk1 (what libc++_shared.so on Android exports). The
# upstream Android prebuilt is built with `zig c++` (std::__1) and cannot load.
# Source: sparse clone of aztec-packages at the barretenberg-rs version pinned
# by noir-rs (Cargo.lock), next to this repo:
#   git clone --depth 1 --filter=blob:none --sparse -b v4.2.0-aztecnr-rc.2 \
#     https://github.com/AztecProtocol/aztec-packages.git ../bb-fork/aztec
#   git -C ../bb-fork/aztec sparse-checkout set barretenberg/cpp
# Usage: ./scripts/build-bb-android.sh arm64-v8a|x86_64
set -euo pipefail
ABI="$1"
NDK="${ANDROID_NDK_HOME:-$HOME/Library/Android/sdk/ndk/27.1.12297006}"
WORKSPACE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CPP="${BB_FORK_DIR:-$WORKSPACE_DIR/../bb-fork/aztec/barretenberg/cpp}"
case "$ABI" in
  arm64-v8a) OUT="$CPP/build-ndk-arm64-android"; ARCH_ARGS=(-DARM=ON) ;;
  x86_64)    OUT="$CPP/build-ndk-x86_64-android"; ARCH_ARGS=(-DTARGET_ARCH=x86-64-v2) ;;
  *) echo "unknown ABI $ABI" >&2; exit 1 ;;
esac
cmake -S "$CPP" -B "$OUT" -G Ninja \
  -DCMAKE_TOOLCHAIN_FILE="$NDK/build/cmake/android.toolchain.cmake" \
  -DANDROID_ABI="$ABI" -DANDROID_PLATFORM=android-29 -DANDROID_STL=c++_shared \
  -DCMAKE_BUILD_TYPE=Release -DENABLE_PIC=ON -DMOBILE=ON -DHAVE_STD_REGEX=ON \
  -DCMAKE_C_FLAGS=-g0 -DCMAKE_CXX_FLAGS=-g0 \
  "${ARCH_ARGS[@]}"
cmake --build "$OUT" --target bb-external
ls -la "$OUT/lib/libbb-external.a"
