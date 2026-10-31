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
- Android not run.

## Run 2 — signed requests (every server delete carries the account's own signature)

Backend redeployed with `X-Creds-Signature` (root did:key ES256 JWS, bound to
method + path, ±300 s, single-use `jti`): `solidarity-id` `66925740`,
`airmeishi-backend` `bcedcaf0`.

Scripted checks against production before the app run: unsigned owned PUT →
401, signed PUT → 201, bearer-only DELETE (no signature) → 401.

App, fresh throwaway `e2esigdel`: passkey connected → D1 `root_vaults` row
`nQz_gn4g…` carries `owner_did did:key:zDnaeX9U…` (the app's signed PUT).
The Page publish failed (relays down), so no name was registered.

Settings → 刪除帳號 with the shortened copy (`08-simplified-copy.jpg`) → one
Face ID → 公開頁面 **失敗**, 名稱 / 線上備份 / Pro 連結 已刪除, 這支手機 等待中,
footer + 重試刪除 (`09-signed-run-nostr-failed.jpg`). damus and nos.lol were
unreachable, so the Nostr step had no 2-of-3 quorum; the phone kept its keys.
After nos.lol came back: 重試刪除 → Face ID → every step done, local wipe ran,
"帳號已刪除" and onboarding (`10-retry-deleted.jpg`).

D1 after: `root_vaults` rows for that did = 0; `signed_request_nonces` in use.

## Web — creds.id/delete-account path (no app)

Throwaway `e2eweb1031` set up through the web builder (pubkey `26afc569…`):
kind 0 `{"name":"keep-me", nip05, alsoKnownAs did:}`, a creds 30078 record,
and a foreign `com.other.app` 30078 record.

`deleteAccountFromWeb` (web-dev, transport `https://creds.id`): first run
name / vault / pro done, nostr failed (relay outage). Retry after relays
recovered → `deleted`, all four steps done.

| Thing | Result |
| --- | --- |
| D1 `nip05_handles` `e2eweb1031` | `pubkey 'erased' / released` |
| primal kind 0 | `{"name":"keep-me"}` (only the creds fields removed) |
| primal kind 30078 creds record | gone; kind 5 present |
| primal `com.other.app` | intact (not ours, not touched) |

## Still not verified

- relay.damus.io unreachable from this machine all day; its state was never read.
- The web page UI was driven via its module in the dev server, not by
  clicking through a real passkey sign-in on creds.id.
- `Cancel` in the confirm dialog shows in English under zh-Hant (shared
  confirmDialog default, outside this change).

