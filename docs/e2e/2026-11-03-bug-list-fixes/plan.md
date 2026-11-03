# E2E plan — 2026-11-03 bug-list fixes (branch 2.0.1)

Build under test: iOS dev client from `apps/expo` on branch `2.0.1` + uncommitted
fixes, iPhone 18 Pro simulator (DD354DEA), Metro on :8082. Web: `airmeishi-web`
dev server :5731 in the browser pane. No real NIP-05 name is registered and
nothing is published (names never free up — memory `sim-cleanup-erases-identities`).

| ID | Bug | Steps | Expected | Verified at |
|---|---|---|---|---|
| W1 | #1 web | `/edit` builder → set template ink after default cream | page ground switches to ink, not cream | DOM computed background of preview |
| W2 | '@' web | paste `https://www.creds.id/@Alice99wonderland` into sign-up name | field = `alice99wonderland` | input value (DOM) |
| W3 | #17/#18 web | open `/edit` (zh) | button 「用 Passkey 建立頁面」, intro says 建立, placeholder 「英文或數字」 | DOM text |
| A1 | '@' app | onboarding username step → type `creds.id/@Alice99` | field = `alice99` | screenshot |
| A2 | #18 app | same screen, empty field | placeholder 「英文或數字」 | screenshot |
| A3 | #15 app | Page → portfolio section editor | each item has 「圖片網址（https://）」; an https image renders in the tile preview | screenshot |
| A4 | #14 app | Me › Edit, change bio, tap ✕ | 「要捨棄變更嗎？」 dialog; 繼續編輯 stays, 捨棄 leaves | screenshot ×2 |
| A5 | #9 app | Page link row with X link, dismiss verify banner | 「驗證」 pill appears on the row; tap restarts check | screenshot |
| A6 | #11 app | saved Page in People → share icon top-right | iOS share sheet with a creds.id link | screenshot |

Not runnable here (marked up front):
- #4 passport read-only rows — needs a scanned passport (NFC), BLOCKED on simulator.
- #8 App Link paths, #10 Android icons — Android-only; need an Android build on the AVD.
- #12 invalid-link message — needs a publish that the schema rejects; UNVERIFIABLE without publishing.
- S1–S3 — server/relay paths; covered by unit tests only, not deployed.
