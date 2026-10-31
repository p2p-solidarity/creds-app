# Account deletion — E2E 2026-10-31

iPhone 18 Pro simulator (iOS 27), Debug dev client 2.0.0, JS from this branch
(metro :8083), against the production services: creds.id `solidarity-id`
worker version `0d597919` (creds-api `d0109dc`), inbox worker
`airmeishi-backend` version `2f1ba121`, relays damus / nos.lol / primal.

## Throwaway identity

Fresh onboarding: new root identity, passkey connected (Settings showed
"通行密鑰 1 把"), name `e2edel1031`, Page published (`01-onboarded.jpg`).
Nostr pubkey `1aa45894…6b53e39`.

Before deletion (curl / relay REQ):

- `nostr.json?name=e2edel1031` → bound to the pubkey; `/id/history` → `active`
- nos.lol + primal: kind 0 `{"alsoKnownAs":["did:key:zDnae…"],"nip05":"e2edel1031@creds.id"}`,
  kind 30078 `d=solidarity.profile` (613 bytes)

## Run

Settings → 重設 → 刪除帳號 (`03-delete-screen.jpg`) → confirm dialog
(`04-confirm.jpg`) → ONE Face ID (simulated match) → progress list
(`06-progress.jpg`) → "帳號已刪除" alert, app back at onboarding
(`07-after.jpg`). No second biometric prompt appeared.

## After (checked independently of the app)

| Thing | Result |
| --- | --- |
| `nostr.json?name=e2edel1031` | `{"names":{}}` |
| `/id/history` | `status: released` |
| `/id/availability` | `available: false, reason: tombstoned` (still reserved) |
| D1 `nip05_handles` | `e2edel1031 / pubkey 'erased' / released` |
| D1 `nip05_audit` for the pubkey | 0 rows |
| D1 `root_vaults` created since 16:40 | 0 rows |
| nos.lol, primal: kind 30078 `solidarity.profile` | gone (NIP-09 honoured) |
| nos.lol, primal: kind 0 | `{}` (creds fields stripped, old one deleted) |
| nos.lol, primal: kind 5 | present, 5 tags |
| local | onboarding gate; identity gone |

## Not verified here

- relay.damus.io: the check script's WebSocket (bun) errored on connect, so
  its state was not read back; the app's publish needs a 2-of-3 quorum, which
  the run passed.
- Pro step ran with no purchase (server answered `deleted: 0`); a real
  bound purchase was not deleted end to end. Route covered by backend tests.
- Inbox step: no legacy Shoutouts key on a fresh install → "nothing";
  the route is deployed and covered by backend tests.
- The failure → "incomplete, keys kept, Retry" path was not forced on the
  simulator; it is covered by `__tests__/unit/accountDeletion.test.ts`.
- Android not run.
- The last commit's padding tweak on the screen was not re-screenshotted.
