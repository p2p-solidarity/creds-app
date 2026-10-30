require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'Attest'
  s.version      = package['version']
  s.summary      = package['description']
  s.homepage     = 'https://github.com/p2p-solidarity/airmeishi'
  s.license      = 'Apache-2.0'
  s.authors      = { 'Solidarity' => 'gm@solidarity.gg' }
  s.platforms    = { :ios => '17.0' }
  s.source       = { :git => 'https://github.com/p2p-solidarity/airmeishi.git' }

  # Hand-written Hybrid Swift for the HybridObjects (MrzOcr, NfcPassport,
  # Semaphore, DeviceAttest) plus the SemaphoreShim wrapper. The uniffi
  # bindings live in the sibling `SemaphoreBindings` pod so their types
  # (RustBuffer, FfiConverter…) stay out of this pod's Swift→C++ interop
  # header, which Nitro generates for the Hybrid*Spec classes.
  s.source_files = [
    'ios/**/*.{swift,h,m,mm}',
  ]

  # Expose the Objective-C exception barrier (MrzVisionGuard) in the pod's
  # umbrella so the pod's own Swift can call MrzPerformVisionRequest without a
  # bridging header (CocoaPods pods can't use one). Pods can't catch an
  # NSException from Swift; this guard does it in ObjC. See MrzVisionGuard.h.
  s.public_header_files = 'ios/MrzVisionGuard.h'

  # `masterList.pem` (ICAO CSCAs) drives passive authentication. Module-local
  # asset copy so CocoaPods includes it in the host app resources script.
  # No circuit or SRS any more (docs/ref/11 P2).
  s.resources = [
    'android/src/main/assets/masterList.pem',
  ]

  pod_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_VERSION'  => '5.9',
  }

  s.pod_target_xcconfig = pod_xcconfig

  # Vision ships with the iOS SDK. Swift's `import Vision` auto-links it, but
  # MrzVisionGuard.mm calls VNImageRequestHandler via the framework header, so
  # link it explicitly to be safe.
  s.frameworks = 'Vision'

  s.dependency 'SemaphoreBindings'

  # VisionCamera is required so we can downcast `any HybridFrameSpec` to
  # the concrete `HybridFrame` and read its CMSampleBuffer / CVPixelBuffer
  # in `HybridMrzOcr.swift`.
  s.dependency 'VisionCamera'

  # Real iOS ePassport NFC path. apps/expo/plugins/withNfcReader.js also
  # injects NFCPassportReader from GitHub into the generated Podfile so
  # CocoaPods resolves the 2.3.0 podspec even though newer releases are not
  # published through the trunk spec repo.
  s.dependency 'NFCPassportReader', '2.3.0'

  load File.join(__dir__, 'nitrogen', 'generated', 'ios', 'Attest+autolinking.rb')
  add_nitrogen_files(s)

  install_modules_dependencies(s)
end
