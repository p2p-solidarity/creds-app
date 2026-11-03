# 結果 — 2026-11-03 bug list 修正（branch 2.0.1，未 commit）

範圍與 build：iOS dev client 由 `2.0.1` + 本次未 commit 修改建置（`expo run:ios`，build 成功並安裝到 iPhone 18 Pro DD354DEA）；web 為 `airmeishi-web` dev server。計畫見 `plan.md`。

**整體判定：BLOCKED（A1–A4 PASS；A5、A6 在模擬器上跑不了，見下）。**

## 判定表

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| W1 #1 web 背景米色 | 換模板後底色跟著模板 | 瀏覽器內 `/edit` 需要 passkey 登入才進得了編輯器，沒跑；改用同一個 `paletteFor` 比對：舊 handler 在 ink 模板仍算出 `#F3EBDD`（米色），新 handler 算出 `#26221C`（ink 本身） | UNVERIFIED（邏輯證據，非 UI） | scratchpad `w1.log` |
| W2 '@' web | 貼上 `https://www.creds.id/@Alice99wonderland` → `alice99wonderland` | `alice99wonderland`（舊版會變 `httpswwwcredsid…` 並被 30 字截斷） | PASS | 瀏覽器 DOM input value |
| W3 #17/#18 web 文案 | 按鈕「用 Passkey 建立頁面」、說明寫「建立」、placeholder「英文或數字」 | 三項都相符 | PASS | 瀏覽器 DOM |
| A1 '@' App | 輸入 `https://creds.id/@Alice99` → `alice99` | 欄位值 `alice99`（idb 讀 AXValue） | PASS | `A1-paste-link.png` |
| A2 #18 App | 空欄位 placeholder「英文或數字」 | `creds.id/@英文或數字` | PASS | `A2-placeholder.png` |
| A3 #15 App | 作品集項目有「圖片網址（https://）」，填 https 圖後格狀預覽顯示圖片 | 欄位存在；填 `https://avatars.githubusercontent.com/u/583231?v=4` 後預覽格顯示該圖 | PASS | `A3-portfolio-image.png` |
| A4 #14 App | 編輯中按 ✕ → 「要捨棄變更嗎？」；繼續編輯留下、捨棄離開 | 對話框出現；繼續編輯後欄位仍是 `e2e1103x`；捨棄後回到頁面、名稱仍是 `e2e1103` | PASS | `A4-discard-dialog.png`、`A4-after-discard.png` |
| A5 #9 App | 關閉驗證橫幅後列上出現「驗證」 | 驗證入口在模擬器上根本不會出現：`canProve = deviceAttestSupported()`，模擬器沒有 App Attest | BLOCKED | 需實機 |
| A6 #11 App | 已存頁面右上角分享 | 要先存一個別人的真實頁面；「打開他的頁面」會對對方連結做檢查並提供見證，動到他人資料，權限檢查擋下，沒有繞過 | BLOCKED | 需要一個自己的第二個測試頁面，或你同意用 `credsdesign` |

## BLOCKED 原因與遠端變動

- **遠端變動（經 Kidney 同意）**：onboarding 在正式目錄註冊了 `e2e1103`（pubkey `4612b702…e231`），並發布了頁面。名稱是永久的；帳號刪除也只會變成墓碑，不會釋出。模擬器關機後會被每小時的清理清掉，這把金鑰也就沒了。
- 觀察：註冊完成前，頁面上的複製連結顯示 `creds.id/…yfpg`（nostr 短連結）；發布完成後變成 `creds.id/@e2e1103`。bug #2 的「顯示 npub」就是名稱還沒發布完成前的這段時間。
- 模擬器輸入法是注音，非網址欄位用 idb／面板輸入會變成注音或全形標點；網址欄位正常。
- 跑測過程中的環境修正（不是這次的 bug）：本機 `apps/expo/ios` 的 `Info.plist`（git 忽略）指向 `SceneDelegate`，但追蹤中的 `project.pbxproj` 沒有這個檔案 → App 開起來全黑。用 `expo prebuild -p ios` 重新產生後恢復；`project.pbxproj` 的變動不會 commit。
- 這個 build 沒有 dev launcher，只會連 Metro :8081。
- 備註：逐字輸入 `creds.id/@alice` 時，每打一個字就整理一次，`@` 會在名字出現前被去掉（結果是 `credsidalice`）。修正只涵蓋貼上／一次輸入整串的情況。

## 不能在這裡跑的（計畫時就標記）

- #4 護照證明唯讀列：要實際掃護照（NFC）。
- #8 App Link 路徑、#10 Android icon：Android 專屬，要在 AVD 上建 Android build。
- #12 無效連結訊息：要發布一個會被 schema 拒絕的頁面。
- S1–S3：只有單元測試，沒有部署。

## 程式碼審閱（code review, not tested）

- #8 根因：`app.json` 的 Android intent filter 宣告整個 `creds.id`（`autoVerify`），`/edit` 被交回 App。改成只認 `/`、`/@…`、`/c/…`、`/pear/…`、`/websign`；已用 Expo config plugin 產生的 manifest 確認只輸出這五條路徑。
- #10 根因：`SfIcon` 沒有 `wave.3.right` 的 Android 對應，退回 `help_outline`（?）。同時補上 `wifi.slash`、`xmark.seal.fill`、`questionmark.circle`。
- #9：關閉橫幅後原本只剩「⋯」選單裡的入口；現在列上直接出現「驗證」小標籤。
- #5、#7、#3、#13、#2、#6：程式裡找不到對應問題，需要在模擬器上看到才能定位，這次沒處理。
