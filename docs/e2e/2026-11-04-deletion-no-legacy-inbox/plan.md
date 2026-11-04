# Plan — account deletion without the legacy inbox step (2.0.1)

Change: `apps/expo/src/account` drops the `inbox` step (POST
`airmeishi-backend.kidneyweakx.workers.dev/inbox/delete`); the worker itself was
reduced to a stub the same day. Legal §14 loses the matching bullet.

Device: iPhone 18 Pro simulator (`793562A3…`), Debug dev client built from the
`2.0.1` working tree, Metro :8081 from the same tree.

| ID | Goal | Steps | Expected | Verified at |
| --- | --- | --- | --- | --- |
| P0 | Build under test has the change | Fetch the iOS bundle Metro serves to the sim | no `airmeishi-backend`, no `inbox/delete`; control string `/pro/binding` present | bundle grep |
| C1 | Step list | Onboard a throwaway identity → Settings → 重設 → 刪除帳號 | exactly 5 rows: 公開頁面 / 名稱 / 線上備份 / Pro 連結 / 這支手機; no 舊版收件匣 | screenshot |
| C2 | Deletion completes | Confirm → Face ID (simulated match) | every server row 已刪除 or 無資料, then 「帳號已刪除」 and the onboarding gate | screenshots; if a name was registered: `nostr.json` `{"names":{}}` and availability `tombstoned` (curl) |
| C3 | Legal copy | Settings → privacy policy §14 | no Shoutouts bullet; Pro bullet followed by the phone-wipe bullet | screenshot |

Not testable here: a device that still holds the 1.3.x Shoutouts key (needs an
old-build → 2.0.1 upgrade); Android.

Remote state: onboarding may register a throwaway `name@creds.id`; deletion
leaves it as a permanent tombstone (same as the 2026-10-31 run).
Cleanup: shut the simulator down afterwards.
