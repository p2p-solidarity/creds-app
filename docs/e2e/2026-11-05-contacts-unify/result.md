# 2026-11-05 · 聯絡人 tab：頁面與手動聯絡人合一

Branch `claude/contacts-unify-2018a9`. Simulator: existing `iPhone 18 Pro` (793562A3), debug build, JS from this worktree's Metro on :8084 (set via the app's `RCT_jsLocation` default, deleted afterwards). Screenshots are kept next to this file locally (gitignored).

## Data used (real, nothing fabricated)
- Saved Page: the public Page creds.id/@gimmy, opened by universal link and saved with 「存入聯絡人」.
- Manual contact: typed in through 新增聯絡人 › 手動輸入, name "Gimmy Chang", company "Solidarity".
- creds.id/@kidney: no published Page (「此位址目前找不到已發布的頁面」), so it was not used.

## Before (`before-list.png`, `before-page-detail.png`)
Two "Gimmy Chang" rows: the manual one plain, the Page one on a lilac block with 「剛剛」. No username. Page detail heading 「頁面簽章有效」. (The before bundle was served by proof-detail's Metro on :8081, whose People code matches this branch's base.)

## Steps and verdicts
| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | Open 聯絡人 | One row style for both; Page row second line `@gimmy`, manual row second line `Solidarity`; no tint, no timestamp | PASS (`after-list-suggestion.png`) |
| 2 | Username lookup | `@gimmy` comes from the live check (Page's Nostr key → kind-0 `nip05` → creds.id directory maps back to the same key), not from the save link | PASS — the Page was saved before this code existed, so the name could only come from the check |
| 3 | Same-name suggestion | Card 「「Gimmy Chang」有兩筆」 with 合併 / 不是同一人 | PASS |
| 4 | Tap 合併 | List shows one "Gimmy Chang · @gimmy" | PASS (`after-list-merged.png`) |
| 5 | Open merged person | Page preview with `@gimmy`; signature card 「頁面內容沒被改過 / 這支手機核對了名字、介紹和連結的簽章：由金鑰 …sJuGcK 簽署，簽完後沒被改過。」; 「你輸入的資料 · 只在這支手機」 shows Solidarity; private-share/request buttons unchanged; 取消合併 + 刪除聯絡人 | PASS (`after-detail-top.png`, `after-detail-merged.png`) |
| 6 | 取消合併 → confirm | Back to two entries, nothing deleted; button becomes 和手動聯絡人合併 | PASS |
| 7 | 和手動聯絡人合併 → pick → confirm | Picker lists the manual Gimmy Chang; merged again | PASS (`after-merge-picker.png`) |
| 8 | Share (top right) on the Page person | Share sheet; copied value `https://creds.id/@gimmy` | PASS (pbpaste). First run showed 「2 個連結」 (message + url); fixed to url-only on iOS, not re-shot after the fix |
| 9 | Unmerge, open the manual contact | Manual detail with 和 creds 頁面合併 + 匯出 vCard | PASS (`after-manual-detail.png`) |
| 10 | Merge from the contact side | Picker lists the Page; after confirm lands on the merged Page detail; list shows one row | PASS |

## Not run
- Dismissing a suggestion (不是同一人) and the persisted dismissal across relaunch.
- Swipe-to-delete / batch delete of a merged person (deletes both the Page and the contact) and batch vCard export.
- Imported link pages (declared, 「未驗證」 second line), dark mode, Android.
- The 「2 個連結」 share fix after the change; the manual entry sheet's new zh-Hant labels after the change (the before run showed them in English).
- A Page whose creds.id name was released or rebound (should clear the stored name on the next launch's check).
