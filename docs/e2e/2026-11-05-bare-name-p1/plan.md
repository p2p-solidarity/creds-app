# E2E plan — P1：`creds.id/name` 不帶 `@` 也讀得懂（docs/ref/15）

Build under test：airmeishi `claude/bare-name-p1`（`f11b9b51` shared、`92b3b5d6` app），airmeishi-web `bare-name-p1`（`7518e61`，vendor shared 3.1.0）。
測試資料：線上已註冊的 `gimmy`（有已發布的 Page）、未註冊的 `zzzzq9`、保留字 `edit` / `admin`。只讀，不改任何遠端資料。

## Web 本機（web worktree 的 vite dev，瀏覽器 pane）

| ID | 步驟 | 預期 | 驗證位置 |
|---|---|---|---|
| W1 | 開 `/gimmy` | 顯示 gimmy 的 Page（名字、creds.id 名稱徽章） | DOM 文字＋network 有 `nostr.json?name=gimmy` 200 |
| W2 | 開 `/@gimmy` | 同 W1（沒退步） | DOM 文字 |
| W3 | 開 `/Gimmy` | 網址變成 `/gimmy`，顯示同一頁 | `location.pathname`＋DOM |
| W4 | 開 `/edit` | builder 頁 | DOM 文字 |
| W5 | 開 `/admin` | 站台 Not found（不是「找不到這個名稱」） | DOM 文字 |
| W6 | 開 `/zzzzq9` | 「找不到這個名稱」的空狀態，標題 `@zzzzq9` | DOM 文字＋network `nostr.json?name=zzzzq9` |
| W7 | 開 `/robots.txt` | 純文字檔 | 回應內容 |

## Web preview 部署（非 production，`wrangler pages deploy --branch bare-name-p1`）

| ID | 步驟 | 預期 | 驗證位置 |
|---|---|---|---|
| P1 | `curl -A Twitterbot <preview>/gimmy` | `og:title` 是 gimmy 的 Page 名稱，不是站台預設 | HTML head |
| P2 | `curl -A Twitterbot <preview>/@gimmy` | 同 P1 | HTML head |
| P3 | `curl -I <preview>/edit` | 有 `content-security-policy` | 回應標頭 |
| P4 | `curl <preview>/llms.txt` | 200 text/plain | 回應 |

## Android（共用 AVD `aniseekr_test`，API 36）

| ID | 步驟 | 預期 | 驗證位置 |
|---|---|---|---|
| A0 | preflight：裝上的 APK 是這個分支 build 的 | manifest 有 `pathAdvancedPattern="/[a-z0-9]{3,30}"`、creds.id 自己一個 filter | `dumpsys package gg.solidarity.app` |
| A1 | `am start -a VIEW -d https://creds.id/gimmy`（不指定 package） | app 開出 gimmy 的 Verified Page sheet | 截圖＋`dumpsys activity` top |
| A2 | `am start -a VIEW -d https://creds.id/edit` | app 轉開 Custom Tab 顯示 builder，不會再丟回 app | 截圖＋top activity 是瀏覽器 |
| A3 | `am start -a VIEW -d https://creds.id/@gimmy` | 同 A1（沒退步） | 截圖 |

## 不在這次範圍 / 事先標記

- iOS：P1 沒有 iOS 系統連結改動（AASA 認領短版是 P3），parser 和掃描器由單元測試覆蓋 → UNVERIFIED。
- bio 標記：沒有 bio 寫著 `creds.id/<name>` 的真實帳號可用 → 只有單元測試（shared `pageCheck.test.ts`）→ UNVERIFIED。
- notary：要等合回 2.0.1 才部署 → 不跑。
