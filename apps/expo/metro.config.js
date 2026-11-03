/**
 * Metro config — Expo + NativeWind 4 + monorepo (bun workspaces).
 *
 * Bun's symlink-hoisted node_modules layout puts every package inside
 * .bun/<pkg>@<hash>/node_modules/<pkg>/. Metro's default node-modules
 * resolver walks the directory tree, so we DO want hierarchical lookup
 * enabled — turning it off has caused
 *   "TypeError: Cannot read properties of undefined (reading 'transformFile')"
 * because metro/babel can't find its own peer deps.
 *
 * Watch the whole workspace so changes in packages/shared etc. trigger
 * a fast refresh.
 */
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Leave `disableHierarchicalLookup` at its default (false) so Metro can
// resolve peer deps through bun's .bun/<pkg>/ layout.

// F-Droid build (EXPO_PUBLIC_CREDS_DISTRIBUTION=fdroid, docs/ref/13-plan-fdroid.md):
// the native modules plugins/withFdroidFlavor.js leaves out of autolinking are
// left out of the bundle too. Their JS looks the native module up on import,
// which would crash at launch; the stub fails only if a hidden feature is
// somehow called (screens hide them via src/platform/distribution.ts).
if (process.env.EXPO_PUBLIC_CREDS_DISTRIBUTION === 'fdroid') {
  const { FDROID_EXCLUDED_MODULES } = require('./plugins/withFdroidFlavor');
  const unavailableModule = path.resolve(projectRoot, 'plugins/fdroidUnavailableModule.js');
  const resolveRequest = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (
      platform === 'android' &&
      FDROID_EXCLUDED_MODULES.some((name) => moduleName === name || moduleName.startsWith(`${name}/`))
    ) {
      return { type: 'sourceFile', filePath: unavailableModule };
    }
    return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
  };
}

// rem = 16, the same as creds.id (airmeishi-web theme.css). NativeWind's
// default is 14, which shipped every Tailwind spacing / radius at ×0.875 of
// the design value (p-4 = 14, rounded-xl = 10.5) — see creds-design handoff.
module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });
