# Result — Present 分享網址 / 卡面 / 線上離線 / 卡背（2026-11-05）

範圍：分支 `claude/present-share-url-718377`（`e852f636`、`6a8b3882` + 星點位置微調）。模擬器 `iPhone 18 Pro`（793562A3），從本 worktree 建的 Debug dev client（含 expo-network），Metro :8085。帳號 `e2etextblk`（模擬器上既有的測試帳號，名稱已註冊、頁面已發布）。沒有改任何遠端資料。截圖在本資料夾（gitignore，只留在本機）。

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| B0 基線 | 記下名稱、網址、線上分頁 | 有名稱 `e2etextblk`，線上可選 | — | `c1-c2-steel.png` |
| C1 卡上網址 | `creds.id/e2etextblk`，無 `@`、無 npub | 卡正面、卡背、實體卡預覽都印 `creds.id/e2etextblk`；頁面頁首同樣；按複製後剪貼簿 = `https://creds.id/e2etextblk`（`simctl pbpaste`）；線上 QR 用 zbarimg 解出 `https://creds.id/@e2etextblk`（照 15 §6，QR 到 P3 才換短版） | PASS | `c1-c2-steel.png`、`c1-me-header.png`、`c1-qr-online.png` |
| C2 卡面跟著換 | 出示頁的卡本身換材質；creds 夜空有極光和星星 | 不鏽鋼 → creds 夜空 → 黃銅 → 黑鈦，出示頁的卡每次都換 | PASS | `c2-creds.png`、`c2-c3-back-brass.png`、`c2-c3-back-titanium.png` |
| C3 卡背固定 | 中央 creds 標誌，不是 wifi / `?` | creds、黃銅、黑鈦三種卡背中央都是 creds 標誌，下面是 `CREDS.ID` 和網址 | PASS（只有 iOS） | `c3-back-creds.png`、`c2-c3-back-*.png` |
| C4 實體卡預覽 | 4 個選項 2×2，預覽跟出示頁同步 | 打開時預覽 = 黑鈦（出示頁當下的選擇）；改成 creds 夜空，關掉後出示頁卡面也是 creds 夜空 | PASS | `c4-sheet-titanium.png`、`c4-sheet-creds.png`、`c4-present-follows-creds.png` |
| C5 有網路時線上可選 | 線上可選、QR 出現 | 線上已選、QR 正常 | PASS | `c1-qr-online.png` |
| C6 沒網路時線上不可選 | 線上反灰，自動切到離線卡和「沒有網路」提示 | 沒跑：模擬器和 Mac 共用網路，斷網會斷掉這個 session | BLOCKED（要實機） | — |

整體：**BLOCKED**（C6 沒跑）。

## 沒驗到的

- C6 斷網：要實機切飛航模式。預期：「線上」反灰、顯示離線 QR 和「這支手機現在沒有網路…」，網路回來後自動回到線上。
- Android：卡背在 Android 上也是 SVG creds 標誌，不再依賴 SF Symbol 對照表，但這次沒在 Android 跑。
- 「名稱已註冊但還沒發布完成」的狀態（卡上印 `creds.id/name`，提示「完成發布」）：測試帳號已經發布好，這次沒走到。

## 執行中調整（不是失敗）

- creds 夜空第一版的暖色極光太亮：react-native-svg 的 `Stop` 吃不到 `rgba` 裡的透明度，改成 hex + `stopOpacity`（`c2-creds-v1.png` → `c2-creds.png`）。
- 兩顆星點壓到名字和實體卡左下角的標誌，移開。

## Code review（沒有測，讀 code 的結論）

- 線上分頁「有時候消失」的原因：線上版能不能用，原本只看「目前這份頁面 JWS 有沒有被中繼站確認」或 `nostrPagePublishedOnce`。這個旗標是 11-04 才加的，之前發布過的安裝從沒寫入它，所以每次改頁面（重新簽章，確認紀錄清空）線上就消失，直到再發布一次。名稱的綁定旗標失敗時也會讓名稱連結掉。改成 `usePageAddressLive()`：已確認、旗標、或名稱綁定好任一個就算上線，並且第一次看到證據就補寫旗標。
- 沒網路時線上還能選的原因：原本完全不看手機的網路狀態。新增 expo-network（原生模組，需要新 build），作業系統明確回報沒有網路時才關掉線上，狀態未知時不當成離線。
- 頁面分頁的分享面板（me/*，不歸這個 session 改）的 QR 還是從 `selected.url` 產生，所以現在會是短版 `/name`。已在 side-session-notes 留言給 me/* 的負責 session。
