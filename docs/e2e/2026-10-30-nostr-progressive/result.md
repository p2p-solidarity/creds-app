# Nostr progressive read — before / after (2026-10-30)

Goal: Nostr reads show what the first relay returns; later relays only refine it; badges and
witnesses verify in the background and show "checking" until they finish.

## What changed

- `fetchLatestEvent` (`src/nostr/publish.ts`): one race over all relays. `onEvent` hands each newer
  matching event to the caller as it lands. `graceMs` (readers: `FIRST_ANSWER_GRACE_MS` = 300 ms, same
  as the web) settles that long after the first EOSE instead of waiting out a dead relay.
- The writer (`updateKind0AlsoKnownAs`) passes no grace: it still waits for every relay, and the
  clobber guard (no event + no EOSE → refuse) is unchanged.
- Each relay is settled once. A dropped damus socket fires both `ws.onerror` and `ws.onclose`. The new
  race first counted that relay twice, which ended the read before slower relays answered (seen live
  in the bench below). `witness.ts` `fetchEvents` already had this bug. Both are fixed.
- `#nostr:` pointer and `/@name` reads paint the first page that passes every gate the final result
  needs (JWS signature, npub reverse binding). A `/@name` page paints with its handle badge `checking`
  (grey clock, "Checking live binding…") before the two-way kind-0 check finishes. A late relay
  answer never reopens a sheet the user closed (ticketed presenter in `verifiedPageResult.ts`).
- `WitnessSection`: rows paint immediately as "checking" (no section spinner). The witness query (one
  multi-`#d` REQ, already) runs alongside the creds.id name lookup instead of after it. The count shows
  "Counting witnesses…" until every relay answered. Witness and passport counts deliberately keep
  waiting for every relay. A missed event can inflate a count (owner-device exclusion, passport rebind).

## Run 1 — live relays, read core (bun, real WebSocket, DEFAULT_RELAYS)

Script: `fetchLatestProfilePointer` + `fetchLatestKind0` for `kidneyx` (me) and `gimmy` (a contact),
6 rounds × 2 people × 2 kinds = 24 reads each side. Same relays, fresh sockets every read.

| | before (median settle) | after (median settle) | after: first event to UI | reads stuck at the 4 s timeout |
|---|---|---|---|---|
| profile pointer (kind 30078) | 4006 ms | 1375 ms | 1064 ms | 8/12 → 0/12 |
| kind-0 | 2709 ms | 1440 ms | 1164 ms | 6/12 → 0/12 |

All 48 reads found the event. Before, damus either refused the socket (~150–400 ms) or never answered,
and the read waited the full 4 s for it.

## Run 2 — simulator (iPhone 17, iOS 27, dev client, Metro 8087)

Deep links `https://creds.id/@gimmy` / `@kidneyx` (the NIP-05 read path; `@kidneyx` is "Me reading back
my own Page"), 4 rounds. Times are from `presentResolving` / `WitnessSection` mount, using temporary
`[perf]` logs (removed before commit). Host load average was 130–950 during both runs (other sessions
building and an Android emulator), so absolute times are inflated. Compare the structure.

| | before | after |
|---|---|---|
| sheet shows the verified Page | 4.6–11.0 s (single paint, final) | **2.0–3.1 s** (interim, badge `checking`) |
| handle badge verdict | same moment as the page | 3.5–6.7 s |
| witness rows visible | after the name lookup (~4.0–4.6 s spinner) | at mount (rows say "Checking…") |
| creds.id name resolved | 4.0 / 4.6 s (= the 4 s relay timeout) | 2.2 s |
| witness count | 8.1 / 8.6 s (two 4 s timeouts in series) | 4.5 s (runs in parallel with the name lookup) |

The "People → open a contact" screen (`app/people/profile/[did].tsx`) renders the same
`VerifiedProfileView` + `WitnessSection`. Its Page content comes from the saved snapshot (no Nostr
wait). Its Nostr wait is the witness section measured above.

The Me tab itself does not read Nostr on first paint (store-backed). Its Nostr badge re-check
(`verifyNostrBinding` → `fetchKind0FromRelays`) is background work and now uses the kind-0 grace read
from Run 1.

## Not verified / caveats

- **Visual of the interim sheet not captured.** On this build, opening a `creds.id/@name` universal link
  lets expo-router navigate to "Unmatched Route" (`solidarity://@gimmy`), which covers the sheet. Before
  and after are the same, so this is not caused by this change; the `[perf]` logs show the sheet state
  being set. Follow-up: add `+native-intent` (or equivalent) so `/@name` links don't route.
- `#nostr:<npub>` universal links did not reach the app on the simulator (the AASA presumably claims
  only `/@*`). The pointer path is covered by Run 1 + unit tests.
- No physical device run.
- Grace on badge kind-0 reads: if the first relay holds an older kind-0 than a slower relay, a badge can
  reflect the older one. The web made the same trade. The 4 s budget had the same exposure for slower
  relays.
- The web (`airmeishi-web/src/services/nostr/fetchProfilePointer.ts`) has the same double-settle bug in
  its `fetchEvents` (`pending -= 1` per callback). Not fixed here (other repo).

## Tests added (red → green)

- `nostrPublish.test.ts`: first relay settles within the grace window while another relay is dead;
  newer event from a later relay replaces the first, older/mismatched ones never reach `onEvent`;
  all relays time out → `{event:null, confirmed:false}`; no grace → waits for every relay; a relay
  erroring twice is counted once; writer waits for a slow relay holding the real kind-0 after a fast
  relay said "none" (regression guard for the clobber path).
- `resolveProfile.test.ts`: interim paint before the dead relay; a relay-substituted page (no npub
  back-claim) never paints.
- `handleProfileResolver.test.ts`: the NIP-05 interim binding is `checking`, never a verdict.
