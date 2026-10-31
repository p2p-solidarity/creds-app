/**
 * App side of Digital Asset Links for passkeys: declares that this app trusts
 * the given site's assetlinks.json. The site side (creds.id lists our signing
 * keys) alone was not enough — Play builds failed passkey creation with
 * "RP ID cannot be validated" (2026-10-31) until the app declared it too.
 */
const { withAndroidManifest, withStringsXml, AndroidConfig } = require('@expo/config-plugins');

const NAME = 'asset_statements';

function withAndroidAssetStatements(config, { sites }) {
  // Android string resources need their double quotes escaped.
  const statements = JSON.stringify(
    sites.map((site) => ({ include: `https://${site}/.well-known/assetlinks.json` })),
  ).replace(/"/g, '\\"');

  config = withStringsXml(config, (mod) => {
    mod.modResults = AndroidConfig.Strings.setStringItem(
      [AndroidConfig.Resources.buildResourceItem({ name: NAME, value: statements, translatable: false })],
      mod.modResults,
    );
    return mod;
  });

  return withAndroidManifest(config, (mod) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, NAME, `@string/${NAME}`, 'resource');
    return mod;
  });
}

module.exports = withAndroidAssetStatements;
