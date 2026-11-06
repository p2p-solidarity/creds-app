# 結果 — 2026-11-06 還原帳號後拉回自己的頁面與名稱

Bug：用救援詞在新裝置還原，只拿回金鑰；已發布的頁面和 creds.id 名稱沒拉回，onboarding 把人帶到「選擇使用者名稱」，自己的名字顯示「已被使用」，「這是我的名稱」只開申訴。

修正：`src/profile/recoverOwnPage.ts`，在 `ExistingAccountSheet` 的三條還原路徑（Face ID／iCloud／救援詞）結束後執行：
- 頁面：`resolveProfileByNpub`（JWS 驗章＋`alsoKnownAs` 綁定 npub）且 `record.did` = 本機根 DID。
- 名稱：`resolveCredsName`（kind-0 `nip05` ＋ creds.id 目錄都指回本機 npub）。
- 兩者都成立才寫入本機，用同樣內容重新發布一次（讓「已上線」標記來自真的 relay 接受），並設定名稱為 ready；否則什麼都不寫，照舊進名稱步驟。

Build：iPad Pro 13″ 模擬器（9B375057，iOS 27.2），Release 模擬器版。帳號 `credsdesign`（pubkey `9182c7d5…`）。

| 案例 | 預期 | 實際 | 判定 |
|---|---|---|---|
| P0 修前重現（救援詞） | — | 匯入成功後進「選擇使用者名稱」，`credsdesign` 顯示已被使用，按「這是我的名稱」跳申訴 | 重現 |
| P1 清空 App 資料後「用 Face ID 登入」（金鑰仍在鑰匙圈） | 直接進頁面；`creds.id/credsdesign`；簡介＋4 條連結；沒有「發布頁面變更」 | 同預期（`after-restore.png`） | PASS |
| P2 第一版修正（只寫頁面＋名稱） | 同上 | 網址顯示 npub 備用 `creds.id/…zr2r`，且有「發布頁面變更」→ 補重新發布＋`publicPageBindingReady` | FAIL → 已修 |
| P3 目錄仍指向同一把金鑰 | `nostr.json?name=credsdesign` = `9182c7d5…` | 同預期 | PASS |
| P4 重啟 App | 頁面、本機大頭貼都還在 | 同預期 | PASS |
| P5 最終程式碼（改讀 store 最新值）清空重裝再登入 | 同 P1 | 同預期（`final-restore.png`，中文介面） | PASS |

驗證：`bun run typecheck && bun run lint && bun run test` exit 0（lint 0 error；unit 1280、parity 54 pass）。

## 沒跑

- 修正後的「輸入救援詞」路徑沒有在 UI 上重跑（要 Kidney 再打一次 24 字）；它和 P1 走同一個 `onRecovered`，只差前面的匯入。
- iCloud 還原路徑沒跑（模擬器沒登入 iCloud）。
- 實機、Android 沒跑。
- 只對自己可見（非公開）的連結無法從 Nostr 拉回，這是設計上的限制。

## 順便發現（未修）

- iPad：大頭貼「從相簿選擇」的系統相簿選擇器開在大頭貼面板**下面**，看起來像按了沒反應；關掉面板才看得到。iPhone 正常。
