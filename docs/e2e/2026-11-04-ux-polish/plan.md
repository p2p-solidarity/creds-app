# E2E plan — 2026-11-04 UX polish (branch 2.0.1)

Build under test: iOS dev client from `apps/expo` on branch `2.0.1` + this session's uncommitted
changes, iPhone 18 Pro simulator (793562A3), Metro :8081. Nothing is published to relays and no
NIP-05 name is registered (names never free up) — every case below is local-only.

| ID | Change | Steps | Expected | Verified at |
|---|---|---|---|---|
| U1 | Publish blocked box | Page › add 作品集 › item with title + link `ftp://x` | inline 「請輸入 https:// 開頭的網址」 under the field, 儲存 disabled | screenshot |
| U2 | Section delete confirm | open a section › 移除 | dialog 「移除「…」？」; 取消 keeps it, 移除 removes | screenshot ×2 |
| U3 | Section cancel guard | edit section title › 取消 | 「要捨棄變更嗎？」 dialog | screenshot |
| U4 | Text section | add 文字 section | one 內容 box, no item title / link / style chips; typed text shows live in preview | screenshot |
| U5 | One-button publish | after U4 save | Page tab shows a single 「發布頁面變更」 button (no card/hint) | screenshot |
| U6 | Link remove confirm | Me › 編輯 › link trash | 「要移除「…」嗎？」 dialog | screenshot |
| U7 | Switch theme | Settings › 偏好設定 | mauve accent, smaller switch, aligned with rows | screenshot light + dark |
| U8 | Existing account | onboarding › 我已經有帳號 | three plain buttons, no paragraph under each | screenshot |
| U9 | Proof not-found | open `credsid://credentials/not-a-real-id` | header with back + 返回 button | screenshot |
| U10 | creds.id/edit link | `simctl openurl https://creds.id/edit` | not "Unmatched Route": in-app browser at creds.id/edit, or Safari | screenshot |

Not runnable here (marked up front):
- Present online/offline after publishing, username nudge on card — needs a published Page (relay write). UNVERIFIABLE without publishing.
- Proof hide/re-show — needs a passport proof (NFC). BLOCKED on simulator.
- People Page-row tint — needs a saved Page from another person (relay read of someone else). Checked only if one exists.
- AASA narrowing — only takes effect after the web deploy + Apple CDN refresh; Android App Links need a device.
