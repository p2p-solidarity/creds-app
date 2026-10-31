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

## 追加：標題和返回鍵同一行（Kidney 回饋）

子頁原本是兩列：上面一列「‹ 設定」（`SettingsBackToolbar`），下面一列置中標題。現在全部改成首頁那種一列：‹（或「取消」的頁面用 ✕）釘在左邊、標題置中；`SettingsBackToolbar` 已無人使用並刪除。返回鍵原本比標題低約 4pt（它的欄位把標題下方 12pt 留白也算進去），一起修正。websign 審核頁原本把標題放在內容裡當大標，也改成同一列。

| # | 畫面 | 截圖 |
|---|---|---|
| 9 | 通行密鑰：‹、標題、ⓘ 同一列且垂直對齊 | `09-header-one-row-passkeys.png` |
| 10 | 隱私權政策 | `10-header-one-row-privacy.png` |
| 11 | 帳號保護 | `11-header-one-row-security.png` |

另外看過開發者選項（同一列）。沒逐頁點開的：username、backup、identity-export、pro、verify/nostr、verify/bluesky、me/edit、websign、驗證工具（同一個元件、同一個機械替換，typecheck 過）。

## 追加：法律文件改成 creds.id（與 creds.id/privacy、/terms 同文）

- App 的隱私權政策／服務條款改由 airmeishi-web `src/content/legal/` 產生（`bun scripts/export-legal-markdown.ts`），依 App 語言顯示 en 或 zh-Hant，標題在地化。新版生效日 2026-10-30。
- 跑過：模擬器開 `credsid://legal/privacy`（繁中）→ 新內容、單列標題，`12-app-privacy-zh.png`。網站 `localhost:5732/privacy` 15 節標題都在、日期 2026-10-30。
- 沒跑：App 英文版、服務條款頁（同一元件與產生器）；網站沒有部署。
- 備註：iPhone 18 Pro 在 20:30 被 `xcode-cleanup.sh` 清掉（關機時 3.25 GB > 3 GB），用 DerivedData 既有的 Debug build 重新安裝。

## 追加：i18n 確認

- App：en／zh-Hant key 完全一致；程式裡靜態用到的 key 全部存在（`i18nCatalog.test.ts`）。刪掉 354 個只剩被砍功能在用的 key（DIDs、分享設定、群組、名片編輯、舊 Me 首頁…），1737 → 1383。動態前綴（`security.mode.*`、`zktls.error.*` 等）不動。
- 修掉與新隱私權政策矛盾的文案：onboarding「金鑰只在這支手機上」→「金鑰在這支手機上簽名」（passkey 會上傳加密副本）；連結查驗「不經過任何伺服器」→「中間不經過 creds.id 的伺服器」。補翻：`Bluesky handle`、`Email`。
- 網站：en／zh-Hant key 一致；中英相同的只剩品牌名、標語與 placeholder。
- 沒跑：刪 key 之後沒有逐頁在模擬器上點過；靠 catalog 測試擋靜態用法。
