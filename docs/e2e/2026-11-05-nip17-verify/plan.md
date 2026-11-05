# E2E plan — NIP-17「對方的 App 還不能收私密訊息」

Bug：2.0.1 TestFlight 向已存的 Page「Kidney」請求護照資料，sheet 顯示 recipientNotReady。
修正：`app/_layout.tsx` 啟動與每次回前景呼叫 `ensureOwnDmRelays()`（原本只在 People 分頁、個人頁、收件匣取得焦點時才發布 kind 10050）。

獨立驗證：scratchpad 的 bun 腳本直接 REQ 中繼站（kind 30078 / 10050 / 1059 `#p`），不經過 App。

| ID | 目標 | 步驟 | 預期 | 驗證位置 |
|---|---|---|---|---|
| L0 | 真實狀況 | 唯讀查 Kidney Page 的 npub 的 10050 | 三個 relay 都 EOSE 且 0 筆（真的「沒有」，不是盲讀） | relay 腳本 |
| H1 | 重現 | 拋棄式 A、B；B 未啟動 → A 用 App 的 `deliverWrap` 寄 | `recipientNotReady` | harness 輸出 |
| H2 | 修正機制 | B 跑 `ensureOwnDmRelays()`（啟動時呼叫的同一函式）→ A 再寄 → B 收 | 10050 found；deliver ok；B 解開同一包 | harness 輸出 |
| S1 | 啟動即發布（模擬器） | B 身分的 App（含修正的 bundle）冷啟動，停在 Page 分頁，不碰 People／收件匣 | B 的 10050 出現在 nos.lol / primal | relay 腳本（啟動前 0 → 後 1） |
| S2 | 請求 | A 對 B 的 Page 請求國籍 | 「已加密寄出」、沒有 recipientNotReady；p-tag B 的 1059 +1 | 截圖 + relay 腳本 |
| S3 | 收件匣 + 同意 | B 開收件匣 → 同意 → Face ID | 「已寄出」；p-tag A 的 1059 +1 | 截圖 + relay 腳本 |
| S4 | 驗證 | A 個人頁 | 「私下出示了 · 國籍 … 未經真機檢查」 | 截圖 |
| R1 | L3 真機 | App Attest / NFC 護照 | — | BLOCKED（模擬器沒有） |
| R2 | TestFlight 上 Kidney 本人 | 新 build 開 App 後查 c2f411c2… 的 10050 | 出現 | 需要 Kidney 裝含修正的 build |
