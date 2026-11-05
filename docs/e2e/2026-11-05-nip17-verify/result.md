# E2E result — NIP-17「對方的 App 還不能收私密訊息」

> 2026-11-05/06 · branch `claude/nip17-verify-a7bba8` · 計畫見 `plan.md`

## 原因
- 字串來自 `deliverWrap`（`apps/expo/src/privateExchange/relays.ts`）：查對方 kind 10050 得到「確定沒有」→ `recipientNotReady`。
- App 只在 `syncPrivateInbox` 裡發布自己的 10050，而它只在 People 分頁、存過的個人頁、收件匣取得焦點時跑。只開 Page 分頁的人永遠收不到。
- 不是盲讀：Kidney 的 Page npub 三個 relay 都回 EOSE 且 0 筆（L0）。也不是 TestFlight 專屬路徑或 relay 選錯。
- 14:00 UTC 唯讀掃描：中繼站上 29 個 creds Page 只有 5 個作者有 10050。

## 修正
- `2bd0f8f7`：`app/_layout.tsx` 啟動與每次回前景呼叫 `ensureOwnDmRelays()`（與 `renewPassportStatement` 同一個 effect）。既有用戶下次開 App 就發布，不用重裝。
- `19675dcc`：自己的 10050 只在**每個** lookup relay 都 EOSE 且沒有時才發布（原本任一 relay EOSE 就算）；冷啟動第一次撥號常掉（damus），沒讀全時重查一次，仍不全就等下次回前景。已有 10050 時不重發，該 process 內快取。

## 環境
- App：iPhone 18 Pro / 18 Pro Max 模擬器上的 debug dev client（2.0.1，原生層同 2.0.1），JS 由本 worktree 的 Metro :8086 提供（`RCT_jsLocation`），一次只開一台。
- A（請求者）= 18 Pro Max，@e2enip17b，npub `3009fa31…`（見 S1）。B（持有人）= 18 Pro，@e2etextblk，npub `e7631f74…`，開發模式護照 E2E000017 / TWN（模擬 NFC）。
- 獨立驗證：scratchpad 的 bun 腳本直接 REQ（kind 30078 / 10050 / 1059 `#p`），不經過 App。

## 結果
| ID | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| L0 | Kidney 的 npub 真的沒有 10050 | `c2f411c2…ac1ef`：damus / nos.lol / primal 都 EOSE、0 筆；Page 最後發布 2026-11-01 | PASS | relay 腳本輸出（14:0x UTC） |
| H1 | 重現症狀 | 拋棄式 B 沒啟動 → A 用 App 的 `deliverWrap` 寄 → `recipientNotReady`（5/5） | PASS | harness 輸出 |
| H2 | 修正機制 | B 跑 `ensureOwnDmRelays()` → 10050 found → A 寄到 relay → B 解開同一包；第一版嚴格規則冷啟動沒讀全而沒發布（FAIL），加重查後 3/3 PASS | PASS | harness run1–5 |
| S1 | 冷啟動就發布 10050 | 還原拋棄式助記詞後，模擬器 keychain 留著舊 Nostr 金鑰，B 以 `3009fa31…` 註冊並發布；這把 key 11-04 已有 10050，看不到「無 → 有」 | INVALID | `nostr.json?name=e2enip17b`、relay 腳本 |
| S2 | 請求送出，沒有 recipientNotReady | sheet 無錯誤；「等待回覆 · 2026/11/13 過期」；p-tag B 的 1059：0→1（nos.lol、primal） | PASS | `S2-a-request-form.png`、`S2-a-waiting.png` |
| S3 | B 收件匣 → 同意 → 送出 | 「1 則私密訊息」→「E2E Holder 想看你的護照資料 · 護照上的國籍」→ 同意畫面誠實（不在 People、名字自填、未經真機檢查）。第一次 FAIL 見下；重跑（A 再請求一次）Face ID 被模擬器鎖住 → sheet 內「沒有通過 Face ID，什麼都沒送出」（p-tag A 仍 6）→ 重設 enrollment 後送出，p-tag A 的 1059：6→7 | PASS（重跑） | `S3-b-*.png` |
| S4 | A 驗證並照實顯示等級 | 「e2etextblk 私下出示了 · 護照上的國籍 TWN · 開發模式護照，未經真機檢查 · 這支手機在 2026/11/06 1:35:09 驗過」 | PASS | `S4-a-verified-answer.png` |
| R1 | L3 真機（App Attest / NFC） | 未跑 | BLOCKED | 模擬器沒有 |
| R2 | Kidney 本人 TestFlight | 未跑 | BLOCKED | 需要含修正的 build；之後用唯讀腳本查 `c2f411c2…` 的 10050 |

整體：**INVALID**（S1 前提壞掉；修正的「啟動即發布」只有 harness 證據，沒有 App UI 證據）。S2–S4 的完整流程 PASS。

## 失敗與偏差
- **S3 第一次**：B 的同意畫面顯示「你的 Page 還沒發佈到 Nostr，對方無法確認是你。」——B 的本機 Page 被其他 session 編輯過，`nostrPublishedJws` 不再對應；我用開發者選項「Nostr 發布」重新發布 e2etextblk 的 Page。之後我要關 sheet 卻誤點「不給」（操作錯誤），A 的 1059 維持 6（不給 = 什麼都沒送，符合預期）。A 改用「再請求一次」重跑。
- Face ID 在模擬器上鎖住（同上次 run）：用 `BiometricKit.enrollmentChanged` 0→1 重設。
- 兩台模擬器第一次開機 SpringBoard 都 crash（-5），shutdown + boot 一次就好。
- 等 Kidney 同意註冊名稱時 Metro 被 App 停掉，簽 Page 報「Could not load bundle」；重開 Metro 後重試成功。
- 18 Pro 原本 3.7 GB（> 清理上限）；每次關機前用上次 run 的 `trim.sh` 刪可重新下載的 MobileAsset。

## 驗證指令
`bun run typecheck && bun run lint && bun run test`：exit 0（lint 0 error / 170 warning 為既有；unit 1273 pass、parity 54 pass）。

## 遠端狀態變更（不清除）
- **NIP-05 名稱 `e2enip17b` → `3009fa31…`**（Kidney 2026-11-06 同意）：D1 列是永久的，只有 Kidney 能刪。
- e2enip17b（`3009fa31…`）重新發布 kind 30078 Page / kind 0；e2etextblk（`e7631f74…`）重新發布 Page。
- p-tag e7631f74 的 1059：2 個（兩次請求）；p-tag 3009fa31 的 1059：+1（答覆）。
- harness 拋棄式金鑰：5 個 kind 10050、約 9 個 1059，沒有 Page / NIP-05。
- Kidney 的帳號沒有寫入任何東西。
- 18 Pro 上的 e2etextblk：新增開發模式護照、開啟模擬 NFC、Face ID enrollment 重設。

## 順便發現（code review + 這次操作碰到，不在範圍）
- **還原助記詞不換 Nostr 金鑰**：`publishWithNostrAutoSetup` 只在 `hasNostrKey()` 為 false 時才 `provisionFromRootMnemonic`；裝置 keychain 若留著舊身分的 Nostr scalar（iOS 刪 App 不清 keychain），還原另一組助記詞後會用舊 npub 發布與收訊。這次 B 還原了 `94103236…` 的助記詞，卻以 `3009fa31…` 發布。需要另開任務確認並修。
- 收件匣 deep link `solidarity:///inbox` 落在 Page 分頁（未查）。

## Not run
- App UI 上的「冷啟動停在 Page 分頁就發布 10050」（S1）。
- 真機 L3、Android、請求過期、拒絕後對方看到過期。
