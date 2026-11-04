/**
 * Expo config plugin — the F-Droid build of the Android app
 * (docs/ref/13-plan-fdroid.md).
 *
 * One switch, read by Gradle and by Metro: the environment variable
 * `EXPO_PUBLIC_CREDS_DISTRIBUTION=fdroid`.
 *
 *   EXPO_PUBLIC_CREDS_DISTRIBUTION=fdroid ./gradlew assembleFdroidRelease
 *
 * With it set, settings.gradle leaves the non-free modules below out of
 * autolinking (Expo and React Native alike) and app/build.gradle adds the
 * `fdroid` product flavor; the nitro modules read `gradle.ext.credsFdroid` to
 * drop their own non-free dependencies. Without it nothing changes: no flavor,
 * same tasks and outputs as the Play build. The JS side reads the same variable
 * through `src/platform/distribution.ts`.
 *
 * Expo autolinking resolves one module list per Gradle run, so a run builds
 * either the Play app or the F-Droid app, never both; asking for an fdroid task
 * without the variable fails at configuration time instead of building a Play
 * classpath under an F-Droid name.
 */
const { withAppBuildGradle, withSettingsGradle } = require('@expo/config-plugins');

const MARKER = '// [withFdroidFlavor]';

/** Native modules that pull Google Play services, ML Kit, Firebase or Play Billing. */
const FDROID_EXCLUDED_MODULES = [
  'expo-iap',
  'expo-camera',
  '@react-native-google-signin/google-signin',
];

const RN_AUTOLINK_CALL = 'ex.autolinkLibrariesFromCommand(expoAutolinking.rnConfigCommand)';
const EXPO_AUTOLINK_CALL = 'expoAutolinking.useExpoModules()';
const SETTINGS_ANCHOR = 'extensions.configure(com.facebook.react.ReactSettingsExtension)';

function injectSettings(src) {
  if (src.includes(MARKER)) return src;
  if (!src.includes(RN_AUTOLINK_CALL) || !src.includes(EXPO_AUTOLINK_CALL) || !src.includes(SETTINGS_ANCHOR)) {
    throw new Error(
      '[withFdroidFlavor] settings.gradle no longer matches the Expo template this plugin patches; ' +
        'update the plugin rather than ship an F-Droid build that links non-free modules.',
    );
  }
  const excluded = FDROID_EXCLUDED_MODULES.map((name) => `'${name}'`).join(', ');
  const setup = `${MARKER} EXPO_PUBLIC_CREDS_DISTRIBUTION=fdroid → F-Droid build (docs/ref/13-plan-fdroid.md)
def credsFdroid = System.getenv('EXPO_PUBLIC_CREDS_DISTRIBUTION') == 'fdroid'
gradle.ext.credsFdroid = credsFdroid
def credsFdroidExclude = credsFdroid ? [${excluded}] : []
if (!credsFdroid && gradle.startParameter.taskNames.any { it.toLowerCase().contains('fdroid') }) {
  throw new GradleException('F-Droid tasks need EXPO_PUBLIC_CREDS_DISTRIBUTION=fdroid in the environment (Gradle and Metro both read it).')
}
// React Native caches its autolinking result by lockfile hash; this marker
// joins the hashed files so switching distribution re-runs autolinking.
def credsDistributionMarker = new File(rootDir, 'build/creds-distribution')
credsDistributionMarker.parentFile.mkdirs()
credsDistributionMarker.text = credsFdroid ? 'fdroid' : 'store'

`;
  const appRoot = "settings.layout.rootDirectory.dir('../')";
  const rnCall = `ex.autolinkLibrariesFromCommand(
      expoAutolinking.rnConfigCommand + credsFdroidExclude.collectMany { ['--exclude', it] },
      ${appRoot}.asFile,
      ${appRoot}.files('yarn.lock', 'package-lock.json', 'package.json', 'react-native.config.js', 'android/build/creds-distribution'))`;
  return src
    .replace(SETTINGS_ANCHOR, `${setup}${SETTINGS_ANCHOR}`)
    .replace(RN_AUTOLINK_CALL, rnCall)
    .replace(EXPO_AUTOLINK_CALL, `expoAutolinking.exclude = credsFdroidExclude\n${EXPO_AUTOLINK_CALL}`);
}

function injectAppBuildGradle(src) {
  if (src.includes(MARKER)) return src;
  return `${src.trimEnd()}

${MARKER} Only exists in an F-Droid run (EXPO_PUBLIC_CREDS_DISTRIBUTION=fdroid);
// the Play build keeps its flavorless variants.
if (gradle.ext.has('credsFdroid') && gradle.ext.credsFdroid) {
    react {
        debuggableVariants = ["fdroidDebug"]
    }
    android {
        flavorDimensions "distribution"
        productFlavors {
            fdroid {
                dimension "distribution"
            }
        }
    }
}
`;
}

function withFdroidFlavor(config) {
  config = withSettingsGradle(config, (cfg) => {
    cfg.modResults.contents = injectSettings(cfg.modResults.contents);
    return cfg;
  });
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = injectAppBuildGradle(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withFdroidFlavor;
module.exports.FDROID_EXCLUDED_MODULES = FDROID_EXCLUDED_MODULES;
