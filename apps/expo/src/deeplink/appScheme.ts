/**
 * The app's own custom URL schemes. `credsid` is the current one (creds.id
 * rebrand) and is what the app emits; `solidarity` / `airmeishi` stay
 * accepted forever so already-shared links, printed QRs and older web
 * builds keep opening the app. Registered in `app.json` `expo.scheme`.
 * Pure — no imports, so the parser and transports can share it without
 * cycles.
 */
export const APP_SCHEME = 'credsid';

const ACCEPTED_APP_SCHEMES = [APP_SCHEME, 'solidarity', 'airmeishi'] as const;

/** `url.protocol` (e.g. `'credsid:'`) is one of the app's own schemes. */
export function isAppSchemeProtocol(protocol: string): boolean {
  return ACCEPTED_APP_SCHEMES.some((scheme) => protocol === `${scheme}:`);
}

/** Raw text starts with one of the app's own `<scheme>://` prefixes. */
export function hasAppSchemePrefix(text: string): boolean {
  return ACCEPTED_APP_SCHEMES.some((scheme) => text.startsWith(`${scheme}://`));
}
