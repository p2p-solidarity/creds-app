/**
 * Ships VisionCameraResizer's Metal IR as a precompiled resource.
 *
 * Xcode Cloud does not reliably provide the optional Metal Toolchain. Replacing
 * the pod's .metal resource with Apple's standard default.metallib keeps the
 * runtime bundle contract intact without compiling shaders during Archive.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('@expo/config-plugins');

const PACKAGE_NAME = 'react-native-vision-camera-resizer';
const SOURCE_RESOURCE = '"VisionCameraResizerShaders" => ["ios/Metal/ResizerKernels.metal"],';
const PRECOMPILED_RESOURCE = '"VisionCameraResizerShaders" => ["ios/Metal/default.metallib"],';
const EXPECTED_SOURCE_SHA256 = '7b7a7145ced739d2be3fd2338c2921c49a8656e524dd8ac6e1d524da39ced43c';
const EXPECTED_LIBRARY_SHA256 = '3f1f5568927c7e3db807b2b909018046e0d5ea732f8efd11e33127c4c1df69ac';

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function resolvePackageRoot(projectRoot) {
  return path.dirname(require.resolve(`${PACKAGE_NAME}/package.json`, { paths: [projectRoot] }));
}

function stagePrecompiledLibrary(projectRoot, packageRoot = resolvePackageRoot(projectRoot)) {
  const sourcePath = path.join(packageRoot, 'ios', 'Metal', 'ResizerKernels.metal');
  const assetPath = path.join(
    projectRoot,
    'native-assets',
    'VisionCameraResizer',
    'default.metallib'
  );
  const packageLibraryPath = path.join(packageRoot, 'ios', 'Metal', 'default.metallib');
  const podspecPath = path.join(packageRoot, 'VisionCameraResizer.podspec');

  if (sha256(sourcePath) !== EXPECTED_SOURCE_SHA256) {
    throw new Error(
      '[withPrecompiledVisionCameraResizerMetal] ResizerKernels.metal changed; regenerate default.metallib'
    );
  }
  if (sha256(assetPath) !== EXPECTED_LIBRARY_SHA256) {
    throw new Error(
      '[withPrecompiledVisionCameraResizerMetal] default.metallib is missing or does not match the pinned build'
    );
  }

  const podspec = fs.readFileSync(podspecPath, 'utf8');
  if (!podspec.includes(SOURCE_RESOURCE) && !podspec.includes(PRECOMPILED_RESOURCE)) {
    throw new Error(
      '[withPrecompiledVisionCameraResizerMetal] VisionCameraResizer resource bundle shape changed'
    );
  }

  fs.copyFileSync(assetPath, packageLibraryPath);
  fs.writeFileSync(podspecPath, podspec.replace(SOURCE_RESOURCE, PRECOMPILED_RESOURCE));
  console.log('[withPrecompiledVisionCameraResizerMetal] staged default.metallib');
}

const withPrecompiledVisionCameraResizerMetal = (config) =>
  withDangerousMod(config, [
    'ios',
    async (cfg) => {
      stagePrecompiledLibrary(cfg.modRequest.projectRoot);
      return cfg;
    },
  ]);

module.exports = withPrecompiledVisionCameraResizerMetal;
module.exports._internal = { stagePrecompiledLibrary };
