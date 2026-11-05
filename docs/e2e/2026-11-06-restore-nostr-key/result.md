# Result — 還原助記詞後 Nostr 金鑰要跟著換

> 2026-11-06 · branch `claude/elegant-elgamal-6b4c58` · fix `637116ce`（基於 2.0.1 `eb0d13cc`）

## 原因
- `rootKey.ts` 的 `importFromMnemonic` / `restoreRootKeyFromICloud` / `createFromFreshMnemonic` 只寫 root 助記詞，從不碰 `userKey.ts` 的 Nostr scalar。
- 發布路徑（`publishWithNostrAutoSetup`、`prepareNostrClaimForSave`、`LinksStep`、`verify/nostr`）只在 `hasNostrKey()` 為 false 時才 provision，所以 keychain 留著的舊 scalar（iOS 刪 App 不清 keychain、設定裡切換身分）一直被拿來簽 Page、kind 0、10050、NIP-17。R1 在模擬器上重現。

## 修正
- root 變成 active（建立、助記詞匯入、iCloud 還原）後一律跑 `reconcileNostrKeyWithRoot`：key 等於這個 root 推導出的、或是在這個 root 下匯入的 nsec → 保留；其他 → 換成這個 root 推導出的 key。寫入失敗就刪舊 key；連刪都失敗才讓還原回 err（fail closed）。
- nsec 的 root 綁定和 scalar 存在同一個 Keychain item（`hex\n<did>`），只有 `loadScalar` 讀，會去掉後綴。
- 已受影響的裝置：再匯入一次自己的助記詞就換回正確的 key（C1）。

## 環境
- iPhone 18 Pro Max 模擬器（NIP-17 run 的 e2enip17b：root `zDnaenSmm…`、Nostr `3009fa31…`），已安裝的 debug dev client，JS 由本 worktree Metro :8088（`RCT_jsLocation`）。
- 觀察：`app/settings/identity-export.tsx` 暫時加 `console.log(getNostrPubkey())`（mount / 匯入後），讀 Metro log；未 commit。期望值來自 `packages/shared/vectors/derive.json`（A `02381af2…`、B `247a9a68…`），不是 App 算的。
- 測試前快照 Keychain 目錄 + App data container，測完還原。沒有發布、沒有註冊名稱。

## 結果
| ID | 期望 | 實際 | 判定 |
|---|---|---|---|
| S0 | 基準 | Nostr `3009fa31…`、root `zDnaenSmm…` | PASS |
| R1 | 修正前：匯入 A → 重現 bug | root 換成 A（`zDnaeuWWic…`），Nostr 仍 `3009fa31…` | PASS（重現） |
| C1 | 修正後：再匯入 A（同 root、舊的未綁定 key） | `02381af2…` = A | PASS |
| C2 | 匯入 B（確認切換） | `247a9a68…` = B，root `zDnaeTqBq…` | PASS |
| C3 | 再匯入 B | 仍 `247a9a68…` | PASS |
| C4 | 冷重啟 | mount 時 `247a9a68…` | PASS |
| X1 | 還原快照 | `3009fa31…`、root `zDnaenSmm…` | PASS |
| U1 | 單元：換 root、nsec 綁定、修好舊 key、寫入失敗不留舊 key、刪不掉 fail closed | 7 pass | PASS |

整個過程沒有出現 Face ID 提示（每步截圖都只有匯入畫面 / 切換確認）。證據：Metro log 的 `[E2E-NOSTR]` 行與截圖留在本機 scratchpad（截圖 gitignored）。

## 失敗與偏差
- 模擬器鍵盤是注音，`idb ui text` 打出注音；改用 `simctl pbcopy` + 貼上。
- 第一次還原快照時路徑寫錯，刪了 Keychain 目錄卻沒複製回去（App 一度顯示 notProvisioned）；用正確路徑重做，X1 驗證回到基準。

## 驗證指令
- `bun run typecheck` 0 error；`bun run lint` 0 error / 169 warning（既有）。
- `bun run test`：exit 0（unit 1280 pass、parity 54 pass）。先前的 1 fail 是本 worktree 沒裝 node_modules，`bun install` 後消失。

## 未執行
- Onboarding「已有帳號 › 輸入助記詞」與 iCloud 還原的 UI 路徑（同一個 `importFromMnemonic` / `restoreRootKeyFromICloud`，單元測試覆蓋）。
- 真機刪 App 重裝。

## 已知取捨
- 修正前匯入的 nsec 沒有綁定：之後只要啟用任何 root（包括再匯入同一組），就會被換成推導出的 key。

## 順便發現（未處理）
- 切換身分後，本機 Page 的 `alsoKnownAs` 仍留著舊 npub 的 `nostr:` claim（`prepareNostrClaimForSave` 只新增不移除）。
