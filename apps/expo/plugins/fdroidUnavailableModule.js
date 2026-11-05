/**
 * Stand-in for a native-backed package the F-Droid build leaves out
 * (metro.config.js swaps it in for withFdroidFlavor's excluded modules).
 * Importing it is harmless; calling any export throws, so a feature the UI
 * should have hidden fails loudly instead of crashing the app at launch.
 */
function unavailable(name) {
  return () => {
    throw new Error(`${String(name)} is not part of the F-Droid build.`);
  };
}

module.exports = new Proxy(
  {},
  { get: (_target, key) => (key === '__esModule' ? true : unavailable(key)) },
);
