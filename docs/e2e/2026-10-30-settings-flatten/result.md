# Settings 層級收斂 — E2E（2026-10-30）

計畫與盤點：`docs/ref/notes-settings-ia-2026-10.md`。

環境：iPhone 18 Pro 模擬器（DD354DEA，iOS 27），既有 Debug app 接 main checkout 的 Metro 8081；全新安裝（停在 onboarding），用 `credsid://settings` 直接打開設定。跑完 `xcrun simctl shutdown all`。

## 跑過

| # | 步驟 | 結果 | 截圖 |
|---|---|---|---|
| 1 | 打開設定首頁（深色） | 偏好設定區顯示外觀、語言兩個行內段落 | `01-hub-top-dark.png` |
| 2 | 外觀點「淺色」→「跟隨系統」；語言點「English」 | 主題立刻切換、介面立刻換英文，段落選取跟著變 | `02-hub-inline-system-english.png` |
| 3 | 捲到底 | 「顯示最近更新」「允許私密名片交換」開關、資料、行內「重設」兩列、關於 | `03-hub-bottom-reset-inline.png` |
| 4 | 點「Reset App Data」 | 跳確認框；按取消，沒有重設 | `04-reset-confirm.png` |
| 5 | 版本點 5 下 | 倒數 toast → 「Developer Options enabled / Find them at the bottom of Settings.」，首頁多出「Developer」區 | `05-dev-unlocked.png` |
| 6 | 進開發者選項 | 憑證庫、驗證工具、合併後的「Scan Request or Offer」、清快取、Nostr 發布、自動發布開關、模擬 NFC | `06-developer-top.png` |
| 7 | 捲到底 | 危險區多了從 Data & Sync 移來的「Reset Identity Keys (Local-Only)」 | `07-developer-bottom.png` |
| 8 | 點「Nostr Publishing」 | 開 `verify/nostr`（全新安裝所以要求先設定身分，符合預期） | `08-developer-nostr-publish.png` |

點擊深度：設定首頁 → 任何子頁 1 次；開發者選項 → 驗證工具／憑證庫 2 次。

## 沒跑

- 沒有實際按「重設」「刪除護照證明」「重設身分金鑰」：三者都會清資料、走 `rotateMasterKey` Face ID 閘門，程式只是搬位置，閘門呼叫原封不動。
- People 頁 Pear 關閉時的「開啟設定」按鈕（現在導到設定首頁）：要先有聯絡人／對方 did 才看得到，沒跑。
- 「允許私密名片交換」「顯示最近更新」開關沒切換（只看到 render）。
- Android 沒跑。
