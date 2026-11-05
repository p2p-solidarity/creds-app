# Plan — 還原助記詞後 Nostr 金鑰要跟著換

裝置：iPhone 18 Pro Max 模擬器（D0C950FF），上面是 NIP-17 run 的 B（e2enip17b）：keychain 有舊 Nostr scalar `3009fa31…`。
App：已安裝的 2.0.1 debug dev client；JS 由本 worktree 的 Metro :8087（`RCT_jsLocation`）提供。
測試身分：`packages/shared/vectors/derive.json` 的兩組公開測試助記詞 A、B（期望 npub hex 已寫在 vector 裡：A `02381af2…`、B `247a9a68…`）。不註冊任何 creds.id 名稱。

觀察方式：設定 → 開發者 → 發布同步 → 「Nostr 發布」，再用 scratchpad 的 bun 腳本直接向 relay 查
`kind 30078` 的 `authors`（不經過 App）。簽 Page 的 npub = 實際用來發布的那把金鑰。

| ID | 程式 | 步驟 | 期望 | 驗證位置 |
|---|---|---|---|---|
| R1 | 修正前（`git show 2.0.1:` 的 userKey/rootKey/PasskeyStep） | 設定 → 身分匯出 → 匯入 A → Nostr 發布 | 重現：發布者仍是 `3009fa31…`，不是 A | relay 查詢 |
| C1 | 修正後 | 再匯入 A（同一個 root，keychain 是未綁定的舊 key） | 發布者 = A `02381af2…`（修好已受影響的裝置） | relay 查詢 |
| C2 | 修正後 | 匯入 B | 發布者 = B `247a9a68…` | relay 查詢 |
| C3 | 修正後 | 再匯入 B | 發布者仍 = B（同 root 不亂換） | relay 查詢 |

清理：Metro 停掉、移除 `RCT_jsLocation`、模擬器關機前確認 < 3 GB。遠端：A、B 的測試 npub 會各有一筆 kind 30078 / kind 0；R1 會在 `3009fa31…` 再寫一次 Page。
