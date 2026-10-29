//
//  HybridZktls.swift
//  @solidarity/nitro-attest (iOS)
//
//  Bridges the creds-zktls Rust prover (zktls/src/lib.rs). The C call blocks
//  for the whole proof (seconds), so it runs on a GCD queue, never on the
//  Swift-concurrency cooperative pool that Promise.async uses.
//
//  Built without CredsZktls.xcframework (a checkout that has not run
//  zktls/build-ios.sh or staged the pinned zip), this compiles to a stub that
//  reports `isAvailable = false` and answers every proof with `unavailable`.
//
import Foundation
import NitroModules
#if canImport(CredsZktls)
@_implementationOnly import CredsZktls
#endif

final class HybridZktls: HybridZktlsSpec {
  private static let queue = DispatchQueue(label: "solidarity.zktls.prove", qos: .userInitiated)

  var isAvailable: Bool {
    #if canImport(CredsZktls)
    return true
    #else
    return false
    #endif
  }

  func prove(requestJson: String) throws -> Promise<String> {
    let request = requestJson
    return Promise.async {
      await withCheckedContinuation { continuation in
        Self.queue.async {
          continuation.resume(returning: Self.runProver(request))
        }
      }
    }
  }

  private static func runProver(_ request: String) -> String {
    #if canImport(CredsZktls)
    guard let output = request.withCString({ creds_zktls_prove($0) }) else {
      return #"{"ok":false,"error":"failed","detail":"prover returned null"}"#
    }
    defer { creds_zktls_free(output) }
    return String(cString: output)
    #else
    return #"{"ok":false,"error":"unavailable","detail":""}"#
    #endif
  }
}
