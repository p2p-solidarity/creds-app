//
//  HybridDeviceAttest.swift
//  @solidarity/nitro-attest (iOS)
//
//  App Attest device keys (docs/ref/10 §3.11 tier 3). The key never leaves
//  the Secure Enclave; `keyRef` is App Attest's key id. Attestation needs
//  Apple's server once per key (~1 s); assertions are local.
//
//  Environment comes from the `com.apple.developer.devicecheck.appattest-
//  environment` entitlement (set to production, so dev-signed device builds
//  produce attestations the production verifier accepts).
//
import CryptoKit
import DeviceCheck
import Foundation
import NitroModules

final class HybridDeviceAttest: HybridDeviceAttestSpec {
  var isSupported: Bool { DCAppAttestService.shared.isSupported }

  func createAttestedKey(alias _: String, challengeB64: String) throws -> Promise<String> {
    let challenge = Data(base64Encoded: challengeB64)
    return Promise.async {
      guard let challenge, challenge.count == 32 else { return Self.failure("failed", "challenge must be 32 bytes") }
      let service = DCAppAttestService.shared
      guard service.isSupported else { return Self.failure("unsupported", "") }
      do {
        let keyId = try await service.generateKey()
        let attestation = try await service.attestKey(keyId, clientDataHash: challenge)
        return Self.success([
          "platform": "ios",
          "keyRef": keyId,
          "keyId": keyId,
          "attestation": attestation.base64EncodedString(),
        ])
      } catch {
        return Self.failure(from: error)
      }
    }
  }

  func sign(keyRef: String, dataB64: String) throws -> Promise<String> {
    let data = Data(base64Encoded: dataB64)
    return Promise.async {
      guard let data else { return Self.failure("failed", "data is not base64") }
      do {
        // App Attest signs SHA-256(authenticatorData || clientDataHash); the
        // verifier recomputes clientDataHash from the same bytes.
        let hash = Data(SHA256.hash(data: data))
        let assertion = try await DCAppAttestService.shared.generateAssertion(keyRef, clientDataHash: hash)
        return Self.success(["signature": assertion.base64EncodedString()])
      } catch {
        return Self.failure(from: error)
      }
    }
  }

  private static func failure(from error: Error) -> String {
    guard let dc = error as? DCError else { return failure("failed", "\(type(of: error))") }
    switch dc.code {
    case .featureUnsupported: return failure("unsupported", "")
    case .serverUnavailable: return failure("serverUnavailable", "")
    case .invalidKey: return failure("invalidKey", "")
    default: return failure("failed", "DCError \(dc.code.rawValue)")
    }
  }

  private static func success(_ value: [String: String]) -> String {
    encode(["ok": true, "value": value])
  }

  private static func failure(_ code: String, _ detail: String) -> String {
    encode(["ok": false, "error": code, "detail": detail])
  }

  private static func encode(_ object: [String: Any]) -> String {
    guard let data = try? JSONSerialization.data(withJSONObject: object) else {
      return #"{"ok":false,"error":"failed","detail":"encode"}"#
    }
    return String(decoding: data, as: UTF8.self)
  }
}
