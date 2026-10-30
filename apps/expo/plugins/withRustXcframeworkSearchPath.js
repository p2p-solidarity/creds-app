/**
 * Expo config plugin — injects a CocoaPods `post_install` hook that adds
 * the absolute on-disk slice paths of the Semaphore xcframework into the
 * app target's `LIBRARY_SEARCH_PATHS[sdk=*]`.
 *
 * Why this is needed:
 *   - CocoaPods doesn't auto-`-l` a static `.a` wrapped in an
 *     xcframework, so each bindings podspec already declares
 *     `OTHER_LDFLAGS = '$(inherited) -l<name>'`.
 *   - For the linker to FIND that `.a`, the consuming app target needs
 *     LIBRARY_SEARCH_PATHS pointing at the xcframework slice
 *     (`ios-arm64-simulator` or `ios-arm64`).
 *   - `user_target_xcconfig` in podspecs is the conventional way to
 *     inject xcconfig into the app target — but CocoaPods bails with
 *     "Can't merge user_target_xcconfig" when two pods both contribute
 *     SDK-conditional `LIBRARY_SEARCH_PATHS[sdk=*]` (the retired passport
 *     MoproBindings pod used to). Injecting via `post_install` keeps a single
 *     owner of the SDK-conditional key.
 *
 * Mirrors the pattern of `withSemaphoreBindingsPod.js` / `withNfcReader.js`
 * — `withDangerousMod` patches the generated Podfile after every
 * prebuild so the change survives `expo prebuild --clean`.
 */
const fs = require('node:fs');
const path = require('node:path');

const { withDangerousMod } = require('@expo/config-plugins');

const HOOK_MARKER = '# [withRustXcframeworkSearchPath] BEGIN';
const HOOK_END = '# [withRustXcframeworkSearchPath] END';

const HOOK_BODY = `
    ${HOOK_MARKER}
    # __dir__ is apps/expo/ios/. The semaphore xcframework lands next to
    # SemaphoreBindings.podspec inside nitro-modules/attest/semaphore/mopro/;
    # reach the airmeishi monorepo root via three ".." hops
    # (apps/expo/ios/ → apps/expo/ → apps/ → airmeishi/).
    airmeishi_root = File.expand_path(File.join(__dir__, '..', '..', '..'))
    semaphore_xcf = File.join(airmeishi_root, 'nitro-modules', 'attest',
                              'semaphore', 'mopro', 'SemaphoreBindings.xcframework')

    installer.aggregate_targets.each do |aggregate_target|
      aggregate_target.user_build_configurations.each_key do |configuration_name|
        xcconfig_path = aggregate_target.xcconfig_path(configuration_name)
        next unless File.exist?(xcconfig_path)

        injected_keys = {
          'LIBRARY_SEARCH_PATHS[sdk=iphonesimulator*]' =>
            "$(inherited) \\"#{semaphore_xcf}/ios-arm64-simulator\\"",
          'LIBRARY_SEARCH_PATHS[sdk=iphoneos*]' =>
            "$(inherited) \\"#{semaphore_xcf}/ios-arm64\\"",
        }

        existing = File.read(xcconfig_path)
        additions = injected_keys
          .reject { |key, _| existing.include?(key) }
          .map { |key, value| "#{key} = #{value}" }
          .join("\\n")
        next if additions.empty?

        File.write(xcconfig_path, "#{existing.chomp}\\n#{additions}\\n")
      end
    end
    ${HOOK_END}
`;

const withRustXcframeworkSearchPath = (config) =>
  withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.projectRoot, 'ios', 'Podfile');
      if (!fs.existsSync(podfilePath)) {
        console.warn(`[withRustXcframeworkSearchPath] missing ${podfilePath}`);
        return cfg;
      }
      const original = fs.readFileSync(podfilePath, 'utf8');
      if (original.includes(HOOK_MARKER)) {
        return cfg;
      }

      // Inject just before the closing `end` of the post_install block.
      // The Expo-generated Podfile contains exactly one such block.
      const closingMatch = original.match(/(\n\s*)end\n(\s*)end\n$/);
      if (!closingMatch) {
        console.warn(
          `[withRustXcframeworkSearchPath] could not find post_install closing brace`
        );
        return cfg;
      }
      const patched = original.replace(
        /(\n\s*)end\n(\s*)end\n$/,
        `${HOOK_BODY}$1end\n$2end\n`
      );
      fs.writeFileSync(podfilePath, patched);
      console.log(
        `[withRustXcframeworkSearchPath] injected LIBRARY_SEARCH_PATHS post_install hook`
      );
      return cfg;
    },
  ]);

module.exports = withRustXcframeworkSearchPath;
