# 2026-10-31 商店截圖（App Store / Play）＋ iPad 問題清單

成品在獨立 private repo `p2p-solidarity/creds-marketing-assets`（本機 `../creds-marketing-assets`）。

## 實際跑了什麼

- iPhone 18 Pro 模擬器（iOS 27，開發版 + Metro）：測試帳號改成示範頁 `creds.id/@credsdesign`（寫入正式 NIP-05 目錄，`curl creds.id/.well-known/nostr.json?name=credsdesign` 確認），頭貼、4 條官方連結、刪掉測試區塊與測試聯絡人、vCard 匯入 6 位示範聯絡人；中英各截 6 張。
- iPad Pro 13 吋暫時模擬器（拍完已刪）：全新安裝走完 onboarding → `creds.id/@credsstudio`（同樣寫入正式目錄），同樣的頁面內容；中英各截 4 張。
- 版型：`creds-marketing-assets/scripts/render.ts`（HTML → Chrome headless），58 張全部輸出、尺寸逐一確認（1320×2868、2064×2752、1080×1920、1152×2048、1440×2560、1024×500）。

## 沒跑／不能當作已驗證

- **Android 沒有實機或 AVD 畫面**：本機沒有 AVD、也沒有 Android build。Play 圖用的是 iOS 截圖（裁掉狀態列），App 是 RN、畫面一致，但不是 Android 真實擷取。Play 平板圖也是手機介面，拿不到「為平板設計」的標示。
- iPad 組沒有「簽章有效」那張：見下面 bug A，公開頁內容是舊的，不放錯的內容。
- 沒有上傳到 App Store Connect / Play Console。
- iPhone 模擬器裡 App 語言最後停在 English（原本是繁中）。

## Bug（iPhone、iPad 都會遇到）

- **A. 發布說「已上線」，公開頁卻是舊內容。** iPhone 上兩次按「發布」都顯示「已上線：creds.id/@credsdesign。QR Code 與分享連結現在都是這個版本」，但 creds.id/@credsdesign 網頁、以及 iPad 用名稱開啟，看到的都還是改之前的內容（名字 230701、E2E test page、Spotify 區塊）。**已修（見下方「發布修正」）。**
- **B. 已有簽章頭貼時，從相簿選的頭貼不會顯示，也沒提示。** `resolveProfileAvatarSource` 讓簽章頭貼優先，相簿頭貼只存本機；畫面停在舊頭貼，看起來像選了沒反應。要先「移除」才會出現。

## iPad 操作／RWD 問題（修正參考）

1. **全部是手機版直接拉滿 1032pt**：輸入框、主按鈕、清單列、卡片都撐到整個寬度，沒有內容寬度上限。建議主內容欄置中、上限約 600–680pt（等同 readable content width），表單更窄。
2. **字級與密度沒跟著放大**：13 吋上字很小、下半部大片空白（頁面、聯絡人、onboarding 都是）。商店圖縮小後手機裡的字幾乎讀不到，這也是 iPad 圖只能靠標題撐的原因。
3. **出示頁金屬卡撐滿整寬**（約 1000×620pt），QR 仍是手機尺寸，比例失衡。卡片應限寬（約名片比例 420pt 內）並和 QR 並排或置中。
4. **Sheet 幾乎全螢幕**（新增、新增連結、個人照片）：iPad 上應改 formSheet／限寬置中；「新增聯絡人」是貼底的全寬抽屜。
5. **Onboarding 中斷就回到第一步**：App 重開或 JS reload 後步驟歸零（名稱草稿有留），平板常被切出去，體驗差。
6. **只支援直向**（`orientation: portrait`）：iPad 常橫放；App Store 不強制，但 iPad 使用者會碰到。
7. **iPad 預設鍵盤是注音**、硬體鍵盤也走注音：使用者名稱／網址欄位沒有設 `autoCapitalize="none"`、`keyboardType="url"`／ASCII 的話，在 iPad 上很容易打出注音（URL 欄也打出了「ㄘㄛ…」）。名稱與網址欄位應強制 ASCII 鍵盤、關自動校正（iPhone 上 "creds" 也被自動改成 "cress"）。

## 頭貼與連結資料

示範頁的連結全部是 Solidarity 官方帳號；聯絡人是 vCard 匯入的虛構人物；「簽章有效＋見證綠勾」截的是 Kidney 自己的頁面（內容裡網站連結標題是「A」，可以順手改）。

## 發布修正（bug A）

**原因**：Page 分頁的「發布」（`ProfileSectionsList.publishPageChanges`）只呼叫 `savePageDesign` → `saveProfile`，在本機重新簽章，從沒呼叫 `publishToNostr`，卻顯示「已上線」。另外，本機已簽但沒發出去的頁面（`nostrAutoRepublish` 預設關閉時的儲存、快速新增連結）不會讓發布卡出現，沒有地方能把它推出去。

**修正**：發布＝（有改才）簽章 → `publishWithNostrAutoSetup(DEFAULT_RELAYS)`；全部中繼站收到才顯示「已上線」，部分收到顯示黃色提示，沒收到顯示「頁面已存在這台裝置，但沒有中繼站收到…」並可重試（不重簽）。發布卡在「公開版本還沒在中繼站確認」（`nostrPublishedJws !== published.jws`）時也會出現。

**實際跑的（iPhone 18 Pro 模擬器，開發版 + Metro）**：
- 舊的 credsdesign 金鑰在 10:31 被 `xcode-cleanup.sh` 清空模擬器時遺失；Kidney 手動從 D1 `nip05_handles` 刪掉 credsdesign 那一筆，重新 onboarding 認領 credsdesign（新 pubkey `31ad4a24…`）。
- 快速新增 4 條連結＋簡介（本機儲存）→ 發布卡出現：`publish-1-card-after-local-save.png`。
- 按「發布」+ Face ID → 「已上線：creds.id/@credsdesign」：`publish-2-live.png`。
- 中繼站 nos.lol、relay.primal.net 直接查 kind 30078：最新事件 04:52:02Z，內容是新的（bio、4 條連結、頭貼）。relay.damus.io 本機 DNS 解析失敗，沒查到。

**沒驗證**：部分成功／失敗／Face ID 取消三種畫面沒有實際觸發過；顯示名稱是 `credsdesign`（舊示範是 `creds design`）；Android 沒跑。

**順手發現（未修）**：快速新增連結完成後寫「已經在你的頁面上了。」，但 `nostrAutoRepublish` 關閉時其實只存本機（`quickAddLink.publishInBackground`），同一類誤導文案。
