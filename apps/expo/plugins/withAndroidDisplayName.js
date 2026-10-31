/**
 * Android home-screen label (`app_name`) = creds.id, without changing the
 * Expo `name`.
 *
 * `name` also names the native projects: prebuild --clean turns it into the
 * Xcode project / scheme (`Solidarity`, which Xcode Cloud builds) and the
 * Gradle rootProject. So `name` stays and only the label changes — iOS via
 * `ios.infoPlist.CFBundleDisplayName`, Android here. User plugins run after
 * Expo's own `withName` strings mod, so this value wins.
 */
const { withStringsXml, AndroidConfig } = require('@expo/config-plugins');

function withAndroidDisplayName(config, { name }) {
  return withStringsXml(config, (mod) => {
    mod.modResults = AndroidConfig.Strings.setStringItem(
      [AndroidConfig.Resources.buildResourceItem({ name: 'app_name', value: name })],
      mod.modResults,
    );
    return mod;
  });
}

module.exports = withAndroidDisplayName;
