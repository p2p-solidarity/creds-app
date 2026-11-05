# Result — 還原助記詞後 Nostr 金鑰要跟著換

> 2026-11-06 · branch `claude/elegant-elgamal-6b4c58` · fix `637116ce`（基於 2.0.1 `eb0d13cc`）

## 原因（code review，未在模擬器重現）
- `rootKey.ts` 的 `importFromMnemonic` / `restoreRootKeyFromICloud` / `createFromFreshMnemonic` 只寫 root 助記詞，從不碰 `userKey.ts` 的 Nostr scalar。
- 發布路徑（`publishWithNostrAutoSetup`、`prepareNostrClaimForSave`、`LinksStep`、`verify/nostr`）都只在 `hasNostrKey()` 為 false 時才 provision，所以 keychain 裡留著的舊 scalar（iOS 刪 App 不清 keychain、或設定裡切換身分）會一直被拿來簽 Page、kind 0、10050、NIP-17。

## 修正
- root 變成 active（建立、助記詞匯入、iCloud 還原）後一律跑 `reconcileNostrKeyWithRoot`：key 等於這個 root 推導出的、或是在這個 root 下匯入的 nsec → 保留；其他 → 換成這個 root 推導出的 key。寫入失敗就刪舊 key；連刪都失敗才讓還原回 err（fail closed）。
- nsec 的 root 綁定和 scalar 存在同一個 Keychain item（`hex\n<did>`），不會寫一半。
- 已受影響的裝置：再匯入一次自己的助記詞就會換回正確的 key。

## 結果
| ID | 期望 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| U1 | 單元：換 root（推導 key / 匯入 nsec / Face ID provision 的 key）→ npub = 新 root | 符合 derive.json vector | PASS | `__tests__/unit/restoreNostrKey.test.ts` |
| U2 | 同 root 再匯入保留 nsec；修正前的舊 key 被修好；寫入失敗不留舊 key；刪不掉就 fail closed | 符合 | PASS | 同上 |
| R1–C3 | 見 `plan.md` | 未跑 | BLOCKED | 18 Pro Max（有 stale key 狀態）被另一個在修同一個 bug 的 session（`objective-herschel-b0a3da`）佔用；沒碰它 |

整體：**BLOCKED**（沒有模擬器 E2E）。

## 驗證指令
- `bun run typecheck`：0 error。`bun run lint`：0 error / 169 warning（既有）。
- `bun run test`：unit 1279 pass / 1 fail —「expo-modules-jsi patches apply to the installed package」，讀的是本 worktree 安裝的 node_modules，跟這次改動無關（未在 baseline 上確認）。parity 因 unit 失敗沒跑到。

## 順便發現（未處理）
- 切換身分後，本機 Page 的 `alsoKnownAs` 仍留著舊 npub 的 `nostr:` claim（`prepareNostrClaimForSave` 只新增不移除）。
