# E2E result — P1：`creds.id/name` 不帶 `@` 也讀得懂

> 2026-11-05 · 計畫：同目錄 `plan.md`；設計：`docs/ref/15-plan-bare-name-url.md`。截圖留本機（gitignored）。

## 範圍與 build

- airmeishi `claude/bare-name-p1`：shared 3.1.0 `f11b9b51`、app `92b3b5d6`、review 修正 `609775cf`、Android 迴圈修正 `1a474b6f`。
- airmeishi-web `bare-name-p1` `7518e61`（vendor shared 3.1.0）。
- Android：worktree prebuild + `assembleRelease`（arm64，範本 debug key `5e8f16…`），裝在共用 AVD `aniseekr_test`（API 36）上的 `gg.solidarity.app`，`install -r` 保留資料。baseline：2.0.1 vc1、三個 host 的驗證狀態都是 1024（未驗證）。為了測試把 creds.id 設成 approved（`pm set-app-links … 2 creds.id`）。

## 結果

**整體：UNVERIFIED**——A2 的「Custom Tab 顯示 builder」這一段沒有看到（原因見下方）。其餘都是 PASS。

| Case | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| W1 `/gimmy` | gimmy 的 Page | 「Gimmy Chang」、`@gimmy 已驗證`；有打 `creds.id/.well-known/nostr.json?name=gimmy` 和 `/id/history?name=gimmy` | PASS | DOM＋`performance` 資源紀錄（vite dev 與 `wrangler pages dev` 各一次） |
| W2 `/@gimmy` | 同 W1 | 同 W1 | PASS | DOM |
| W3 `/Gimmy` | 網址變 `/gimmy` | `location.pathname = /gimmy`，顯示同一頁 | PASS | DOM |
| W4 `/edit` | builder | 「用 Passkey 建立頁面」 | PASS | DOM |
| W5 `/admin` | 站台 Not found，不查目錄 | 「找不到頁面」，沒有任何 `creds.id/` 請求 | PASS | DOM＋資源紀錄 |
| W6 `/zzzzq9` | 「找不到這個名稱」 | `@zzzzq9` 尚未發佈頁面；有打 `nostr.json?name=zzzzq9` | PASS | DOM＋資源紀錄 |
| W7 `/robots.txt` | 純文字 | `text/plain`（另 `/llms.txt` 也是 `text/plain`） | PASS | 回應 |
| 標頭 | `/edit` `/gimmy` `/@gimmy` `/admin` 都有 CSP | 都有 `content-security-policy` 和 `x-frame-options: DENY` | PASS | `wrangler pages dev` curl |
| P1 preview `/gimmy` 連結預覽 | og:title 是 gimmy | `Gimmy Chang · creds.id/@gimmy`；站台 JSON-LD 已拿掉；og:url 仍是 `/@gimmy`（P2 才換） | PASS | `curl -A Twitterbot` |
| P2 preview `/@gimmy` | 同 P1 | 同 P1 | PASS | curl |
| P3 preview `/edit` | 有 CSP | 有 | PASS | curl 標頭 |
| P4 preview `/llms.txt` | 200 text/plain | 200 `text/plain; charset=utf-8` | PASS | curl |
| A0 裝上的 build | creds.id 專用 filter 有 `/[a-z0-9]{3,30}` | `PatternMatcher{ADVANCED: /[a-z0-9]{3,30}}` 只在 creds.id 的 filter；JS bundle 含修正 | PASS | `dumpsys package`、APK bundle grep |
| A1 `https://creds.id/gimmy`（不指定 package） | app 開出 gimmy 的 Verified Page | 「Gimmy Chang」「Page signature valid」「gimmy · Live binding verified」（修正前後各跑一次） | PASS | `A1-gimmy-after.png`、`A1-rerun-after.png`、uiautomator |
| A2 `https://creds.id/edit`（第一次） | app 轉 Custom Tab，不迴圈 | **迴圈**：`BrowserProxyActivity` 發出的 VIEW 被解析回 app 自己，約 0.3 秒一次、task id 跑到 376 | FAIL | `A2-edit-after.png`、logcat |
| A2（修正 `1a474b6f` 後重跑） | 同上 | 只有 4 次啟動：app → `BrowserProxyActivity` → `pkg=com.android.chrome` → Chrome；15 秒內沒有回到 app。Chrome 停在它的首次使用畫面，**看不到 builder** | 不迴圈 PASS／builder UNVERIFIED | `A2-rerun-after.png`、`A2-rerun-logcat.txt` |
| A3 `https://creds.id/@gimmy` | 同 A1 | 同 A1（修正前後各跑一次） | PASS | `A3-rerun-after.png` |

A2 的 builder 要過 Chrome 首次使用畫面才看得到，那一步是同意 Chrome 的服務條款，要 Kidney 同意才能按。

## 沒有跑 / UNVERIFIED

- iOS：P1 沒有 iOS 系統連結改動（AASA 認領短版是 P3）；parser 和掃描器只有單元測試。
- bio 標記同時接受兩種形式：沒有 bio 寫著 `creds.id/<name>` 的真實帳號，只有 shared 的單元測試（`pageCheck.test.ts`）。
- notary：要等合回 2.0.1 才部署。
- 後端改成 import shared 清單（`c08c0ff`）：auto mode 擋下部署後，Kidney 自己跑了 `deploy:nip05`，版本 `7d3aaf5c`（100% 流量）。線上複驗：199 字全部 `reserved`，`EDIT` → `reserved`，`_` / `c` / `id` → `invalid`（原本是 `reserved`，符合預期），`gimmy` → `taken`，`zq7probe9x` → `available`。

## 遠端狀態變更

- web preview 部署 `bare-name-p1.airmeishi-web.pages.dev`（非 production；production 仍是 `d28df9a`）。
- AVD：`gg.solidarity.app` 換成這個分支的 build（資料保留）。creds.id 的 App Link 狀態**還是 approved**：`--re-verify` 清不掉手動核准，模擬器又已經關了。下次開機後用 `adb shell pm set-app-links --package gg.solidarity.app 0 creds.id` 還原。我開的模擬器已關。
- worktree 裡 prebuild 產生的 `apps/expo/android/` 已刪；磁碟剩 24 GB（build 前 40 GB，多半是 Gradle 快取）。

## 偏離計畫

- web 本機改用 `wrangler pages dev dist`（瀏覽器 pane 在背景時 vite dev 的 module 載入太慢，腳本逾時）；連帶多驗到 Functions、`_routes.json`、`_headers`。
- A2 失敗後沒有照計畫的備案把 Android 認領延到 P3，而是修根本原因（`+native-intent.tsx` 在 Android 指定 Custom Tab 瀏覽器），重 build 後重跑 A1–A3。

## code review，不是測試結果

- 迴圈不是 P1 才有：2.0.1 的保底（`b9442892`）在 Android 上，任何被 App Link 認領、但 parser 回 `unknown` 的 creds.id 網址（例如 `creds.id/c/不是-uuid`、沒有 `req` 的 `/websign`）都會一樣繞圈；正式版的 App Link 驗證過就會發生。`1a474b6f` 一起修掉。
- bio 標記還是會接受別人網址參數裡的 `creds.id/alice`（例如 `?u=creds.id/alice`），`/@` 形式原本就這樣；這次沒改。
- `_routes.json` 改成 `/*` 後，所有沒排除的路徑都會叫 Functions，會吃 Functions 額度。
- web 還有兩份名稱 regex（`nameInput.ts`、`router.tsx`），可以之後改用 shared 的 `CREDS_NAME_RE`。
