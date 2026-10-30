/**
 * Passport → npub binding (docs/ref/10 §3.11) is retired (docs/ref/11 P0).
 * Its `openac_show` proofs are not bound to an issuing state, so made-up
 * passport data proves under the pinned vk with any nullifier: no published
 * binding can stand behind a "distinct passport" count. The app no longer
 * publishes bindings, and none counts. Plan 11 P1 replaces this with a
 * device-attested passport statement.
 */

/** How many distinct passports stand behind `npubHexes`: none can be trusted yet. */
export async function countPassportHolders(
  _npubHexes: readonly string[],
  _relays: readonly string[],
): Promise<number> {
  return 0;
}
