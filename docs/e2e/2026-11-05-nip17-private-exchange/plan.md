# E2E plan — NIP-17 護照私密出示（docs/ref/16 P1）

> 2026-11-05 · branch `claude/nip17-private-exchange-c25c08`

## 環境
- 身分 A（請求者）：iPhone 18 Pro 模擬器（793562A3…）。身分 B（持有人）：iPhone 18 Pro Max 模擬器（D0C950FF…，既有裝置，不新建）。**一次只開一台**。
- App：已安裝的 Release `.app`（2.0.1 (1)，2026-11-04 23:17 build，原生層與本分支相同：最後原生改動 `6fb20a15` 22:50），把 `main.jsbundle` 換成本分支 `expo export:embed --bytecode` 的產物。
- 中繼站：公開的 nos.lol、relay.primal.net、relay.damus.io；只用拋棄式測試身分，**不註冊 NIP-05**。
- 獨立驗證：scratchpad 的 bun 腳本直接查中繼站（kind 10050、kind 1059 的 `#p` 計數），不經過 App。

## 案例
| ID | 目標 | 步驟 | 預期 | 驗證位置 |
|---|---|---|---|---|
| C0 | 測的是本分支的 JS | 安裝換過 bundle 的 `.app`，開 A | 個人頁看得到「私下請求」區塊 | 截圖 |
| C1 | 兩個身分都有 npub 且 Page 已發佈 | A、B 各自完成 onboarding／確認 Page 已發佈 | 兩個 npub；各自的 kind 30078 Page 查得到 | bun 腳本查 relay |
| C2 | B 發佈自己的 10050 | B 開 People 分頁（觸發同步） | B 的 kind 10050 出現在 relay，列 nos.lol＋primal | bun 腳本 |
| C3 | B 有一本開發模式護照 | B：開發者模式＋模擬 NFC，掃護照 | 護照存檔；（私密 claim 只有國籍，模擬晶片沒有姓名） | 截圖 |
| C4 | A 存 B 的 Page | A 開 B 的 `creds.id/#nostr:<npub>` 連結並存到 People | People 有 B | 截圖 |
| C5 | A 寄出請求 | A → B 的個人頁 → 請求護照資料（姓名＋國籍）→ 送出 | toast「已加密寄出」，個人頁「等待回覆」 | 截圖＋bun 腳本：p-tag B 的 1059 數量 +1 |
| C6 | B 收到請求並看到誠實的同意畫面 | 關 A、開 B → People | 「1 則私密請求」→ 同意畫面：A 的名字＋short DID、「不在你的 People」、國籍可選、姓名「你沒有這項」、「無法證明是真機」警告、中繼站隱私說明 | 截圖 |
| C7 | Face ID 拒絕時什麼都不送 | 送出 → Face ID 失敗 | toast「沒有通過 Face ID，什麼都沒送出」；p-tag A 的 1059 數量不變 | 截圖＋bun 腳本 |
| C8 | B 同意並回覆 | 送出 → Face ID 通過 | toast「已寄出；對方會看到未經真機檢查」 | 截圖＋bun 腳本：p-tag A 的 1059 數量 +1 |
| C9 | A 驗證回覆並照實顯示等級 | 關 B、開 A → B 的個人頁 | 「B 私下出示了 · 國籍 XXX · 開發模式護照，未經真機檢查」＋驗證時間 | 截圖 |

## 不在本次範圍（照實列為 Not run）
- L3（App Attest／Key Attestation）：模擬器沒有，需 TestFlight 實機。
- Android、網頁。
- 拒絕後請求過期的 7 天路徑。
