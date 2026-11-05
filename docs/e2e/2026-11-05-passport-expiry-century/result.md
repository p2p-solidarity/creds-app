# 護照到期日世紀判斷 — 2026-11-05

## 範圍與 build

- 修正：MRZ 的 YYMMDD 到期日一律當 20YY；出生日改成「不能晚於今天」（晚於今天就是 19YY）。兩者共用 `mrzDate(yymmdd, kind, now)`（`apps/expo/src/passport/pipeline.ts`）。手動輸入、相機掃描結果、存檔時的 `passportExpiresAt` 都改用它。草稿上的 YYMMDD 字串（BAC/PACE 金鑰用）沒動。
- 實測時另外發現並修正：手動輸入的日期欄一次打一個數字時打不進去（O1）。
- 裝置：`iPhone 18 Pro` 模擬器（iOS 27）。App 用 NIP-17 session 01:59 裝的 Release 2.0.1 原生殼（iOS 原生與本分支相同，只差 Android intent filter），`main.jsbundle` 換成本 worktree `expo export:embed` + `hermesc` 編出的版本。安裝後的 bundle sha1 `20689044…` = 本次編出的檔案；bundle 內可找到 `mrz:O.expiryDate,kind:"expiry"`。
- 進入點：`solidarity://passport?manual=1`。停在 NFC 步驟，沒讀晶片、沒存憑證、沒發布任何東西。

## 結果

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| E1 到期日輸入 2031/01/01 | 欄位顯示 `2031/01/01`，出生日 `1990/01/15` | 同預期 | PASS | `E1-expiry-2031-typed.png` |
| E2 按 Continue | 進 NFC 步驟（SCREEN PASS-2），沒有 expired 錯誤 | 同預期 | PASS | `E2-nfc-step.png` |
| E3 到期日 2025/01/01 再按 Continue | 「Passport appears to be expired.」 | 同預期 | PASS | `E3-expired-2025.png` |
| O1 日期欄一次打一個數字 | 數字逐一累積、自動補 `/` | 修正後 `1` → `1990/0` → `1990/01/15` | PASS（修正後） | `O1-partial-birth.png` |

截圖只存在本機（gitignored）。

## O1：修正前的失敗

修正前，在出生日欄點一下鍵盤上的 `1`，欄位還是空的。對照組：同一畫面在國籍欄點退格，`TWN` 變 `TW`，所以點擊本身是有效的。原因：欄位的值是 `fromMrzYyMmDd(draft…)`，草稿湊滿 6 碼前這個值都是 `''`，受控 TextInput 每打一個字就被清掉。NIP-17 session 能輸入 2029/12/31，推測是工具一次送出整串字。修正：`DateField` 自己保存正在打的文字；外部（相機掃描）改了草稿時才覆蓋。

## 偏差

- 第一次開深連結時 app 還在載入，隨後的導航把護照畫面關掉，那一輪的點擊與輸入作廢（INVALID），之後重開深連結重跑。
- 模擬器的 `text` 指令在這個 app 只送得進第一個字，另一次打成注音。所有數字都改用點螢幕鍵盤輸入，跟真人操作一樣。
- 編 bundle 時沒有讀主 checkout 的 `.env`（規則禁止），所以 bundle 裡沒有 `EXPO_PUBLIC_*`（Google 登入、distribution、fetch 開關），護照流程不用這些值。
- 模擬器上的 app 換成了本分支的 JS bundle，取代原本 NIP-17 session 的版本，App 資料保留。

## 沒跑的

- NFC 讀取（模擬或真晶片）與之後的存檔：本修正只動到存檔時的 `passportExpiresAt` 世紀判斷，有單元測試，沒有實機跑。
- 相機掃描（模擬器沒相機）：`MRZCameraStep` 的日期顯示改用 `mrzDate`，沒有實機跑。
- 從草稿值重新掛載日期欄（掃描後帶入）：只有程式碼與單元測試。
- Android、真機。

## 單元測試（不是 E2E）

`apps/expo/__tests__/unit/passportMrzDates.test.ts`，16 個測試：到期 2029/2030/2035/2099、出生 1929/1930/2005、生日是今天或明天、到期日是今天（當天仍有效）或昨天、格式錯誤。換回舊程式碼跑，9 個失敗。
