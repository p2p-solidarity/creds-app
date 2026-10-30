# 2026-10-30 — Face ID／密碼提示次數（docs/ref/10 §1 五條 user story）

Branch `claude/clever-napier-5d15c2`（base 2.0.0 @ 838514f7）。

## 結論（預設使用者，冷啟動起算）

| Story | 改動前（`balanced` 預設） | 改動後（`redLineOnly` 預設） |
|---|---|---|
| 1a 建立新身分 → 連結頁簽 Page → 背景發佈 | 1 | **0** |
| 1b 建立（iCloud 還原的身分）→ 連結頁 | 2 | **0** |
| 2 加 2 個連結＋各自確認加綠勾 | 1 | **0** |
| 3 出示自己的 QR（打開＋切換欄位） | 1 | **0** |
| 4 Pear 交換（握手＋放卡） | 2 | **1**（`cardRelease`，見「交給 Kidney」） |
| 5 護照（綁定→存→npub 綁定→公開揭露）→ 下一個動作 | 3 | **0** |
| 6 同一次使用：加連結 → 出示 QR → 再加連結 | 1 | **0** |

舊金鑰（2026-06-13 前安裝留下的 Secure Enclave `.userPresence` 金鑰）的使用者：3、5、6 還剩 **1** 次——
是金鑰本身的 keychain ACL 在原生簽章裡問的，JS 端拿不掉（見「交給 Kidney」）。

紅線動作（換金鑰、顯示助記詞、刪 ZK 身分、把模式調弱）在任何模式都照舊每次問。

## 怎麼量的

1. **提示帳本（主要量測）**：`apps/expo/__tests__/ledger/faceidPrompts.ledger.test.ts` 用 bun 跑**真的**
   gate、root signer、device signer、profile store、護照公開揭露、QR 產生程式碼，只假造網路和原生金鑰庫（原生
   SignSession 照 `HybridSpruceDid.swift` 的規則模擬：300 秒、從第一次成功起算、不滑動）。每條 story 從冷啟動開始
   （沒有寬限、原生 context 未 arm），依畫面的呼叫順序一個意圖一個意圖跑，數每一個 OS 認證視窗
   （expo sheet＋原生 keychain／prime sheet）。
   - `ledger-before.jsonl`：未改的 2.0.0（scratch worktree @ 838514f7）＋舊原生 binary。
   - `ledger-after.jsonl`：只有核心改動（commit 1）。
   - `ledger-final.jsonl`：全部改動，三個模式。
2. **模擬器：沒跑成**，見「沒跑到的」。

## 成因（查證過的）

| # | 成因 | 程式位置 | 處理 |
|---|---|---|---|
| A | JS 寬限（5 分）和原生 SignSession（300 秒）互不相通 | `keychain/biometric.ts`、`HybridSpruceDid.swift` | 合併（commit 1） |
| B | `everyTime` 對舊金鑰不成立：原生 300 秒重用不看模式 | 同上 | 修好（commit 1） |
| C | `requireSensitiveAction` 沒有 in-flight 合併，兩個同時的簽章疊兩張 sheet | `keychain/biometricGatekeeper.ts` | 合併成一張（commit 1） |
| D | 預設 `balanced`：每 5 分鐘、每次冷啟動的第一個存取級動作都問 | `keychain/sensitiveActionPolicy.ts` | 預設改 `redLineOnly`（Kidney） |
| E | 出示自己的 QR 要用裝置金鑰簽章，走存取級閘門 | `cards/solidarityQrRuntime.ts` | 不問（Kidney） |
| F | 護照公開揭露前後都清寬限 | `disclosure/publicDisclosure.ts` | 兩個都拿掉（Kidney） |
| G | Nostr 金鑰推導走紅線 `revealRecoveryBundle` | `nostr/userKey.ts` | 改一般閘門（Kidney Q2） |
| H | `everyTime` 每個簽章都問（存一次 Page = 3 次） | `identity/rootKey.ts` signer | 每個用戶動作一次（Kidney Q3） |
| I | 紅線、Pear `cardRelease` 本來就每次問 | — | 沒動 |
| J | passkey 系統 sheet（onboarding 連網頁、settings/passkeys） | `identity/rootVaultSync.ts` | 系統 UI，沒動 |
| K | 「密碼」提示 = Face ID 失敗後的 passcode fallback，不是額外的 prompt | `fallbackLabel` | 沒動（拿掉會把 Face ID 失效的人鎖在外面） |

## 改了什麼

**commit 1 `374be744`**：`feat(keychain): one Face ID arms both the JS grace and the native sign session`
- `biometric.ts`：兩個閘門共用一個 OS prompt 出口 `promptForGrace`。同時發生的存取級請求合併成一張 sheet，成功才
  arm 寬限；紅線和 Pear 放卡走 `promptOnce`（不合併、不 arm）。寬限 reset 用 generation 計數：reset 前已經在
  畫面上的 sheet 成功了，也不會把寬限重新打開。
- `nativeSignSession.ts`（新）：iOS 舊 native-ACL 金鑰上，JS 閘門的 live prompt 改在原生 SignSession 的 context
  上做（`primeSignSession`），一張 sheet 同時 arm 兩個寬限；每次 JS reset、選 `everyTime` 都會 `resetSignSession`。
  舊 binary（沒有這兩個方法）和 Android（auth-bound key 每個簽章都要 BiometricPrompt）維持原本行為。
- `nitro-modules/keystone`：spec 加 `primeSignSession(reason)`／`resetSignSession()`。iOS 實作：fresh context →
  `evaluatePolicy(.deviceOwnerAuthentication)` → arm；Android 回 `'unsupported'`。用 nitrogen 0.37.1 重產。

**commit 2、3**：Kidney 的決定（2026-10-30 由 parent session 轉達，本 session 由使用者直接確認）
- 預設模式 `redLineOnly`。**舊用戶遷移**：只有 v3 紀錄（在 Settings 點過模式才會寫）算明確選擇，照舊保留——
  選過 `everyTime`／`balanced` 的人不變。沒有紀錄的人，以及只有 v1（逐項開關）／v2（單一開關）舊紀錄的人，都
  改成 `redLineOnly`：那兩種舊格式表達不了「比舊預設更嚴」，所以都不算選擇。讀不懂的 v3 紀錄、MMKV 還沒讀到的時候，
  fail closed 到 `balanced`，明確選過的人不會因為讀取失敗被降級。
- 出示自己的 QR（Present 分頁的名片 QR、Settings › 分享的預覽）：新的 `signOwnCardJwt`／`signOwnCardRaw` 只給
  `solidarityQrRuntime.ts` 用，任何模式都不走 app 的 Face ID。Page QR 本來就用存檔時預簽的 projection，不簽章。
- 護照公開揭露：拿掉前後兩個 `resetBiometricGrace`。它只是公開一個抽象 claim，不碰金鑰，跟其他 root 簽章一樣照模式走。
- Nostr 金鑰推導：`readMnemonicForKeyDerivation()` 走存取級 `presentProof` 閘門。顯示助記詞照舊是紅線。
- `everyTime`：一次 `getRootSigner()` 拿到的 signer 只授權一次，只蓋它自己後面的簽章，最多 60 秒。

## 各模式明細（帳本，冷啟動起算）

格式：改動前 → 改動後。舊金鑰 = native-ACL。

| Story | balanced·新金鑰 | balanced·舊金鑰 | everyTime·新金鑰 | everyTime·舊金鑰 | redLineOnly·新／舊 |
|---|---|---|---|---|---|
| 1a | 1 → 1 | 1 → 1 | 3 → **1** | 3 → **1** | 0 / 0 |
| 1b | 2 → **1** | 2 → **1** | 4 → **2** | 4 → **2** | 0 / 0 |
| 2 | 1 → 1 | 1 → 1 | 12 → **4** | 12 → **4** | 0 / 0 |
| 3 | 1 → **0** | 1 → 1 | 2 → **0** | 1 → 1 | 0 / 1 |
| 4 | 2 → 2 | 2 → 2 | 2 → 2 | 2 → 2 | 1 / 1 |
| 5 | 3 → **1** | 3 → **1** | 8 → **5** | 6 → **5** | 0 / 1 |
| 6 | 1 → 1 | 2 → **1** | 7 → **2** | 7 → **2** | 0 / 1 |

改動前的 `redLineOnly` 沒量（當時不是預設）。逐意圖明細在 jsonl。`everyTime` 下 story 5 的公開揭露是 2 次：
揭露簽章和存 badge 的 Page 簽章，各用一個 signer。

## 交給 Kidney 決定（沒改）

1. **Pear `cardRelease`**（剩下唯一一個非金鑰的提示）：把簽好的名片交給**遠端**的 peer，是逐 peer 的同意。
   CLAUDE.md 的安全硬規則和 `sensitiveActionPolicy.ts` 都把它列為「每次都問」，因為一旦放行就收不回來。
   拿掉的話，連上線的對方發 `card.request` 就能直接拿到卡、使用者不用碰手機；畫面上的「分享」按鈕還在，所以真正少的是
   「Face ID 證明是本人按的」這一層。建議保留；若要拿掉，要一起改 CLAUDE.md 那條規則。
2. **舊 Secure Enclave 金鑰**：keychain ACL（`.userPresence`）寫在金鑰上，JS 拿不掉。出示 QR、護照綁定簽章在
   `redLineOnly` 下還會在原生簽章裡問一次（之後 300 秒內不再問）。要歸零只能把金鑰遷移成 iCloud 同步的軟體金鑰，
   而 did:key 會跟著換、已經發出去的簽章要重簽——是另一個任務。

## 驗證

- 新增／更新的 TDD 測試（安全接縫）：
  - `biometricSharedPrompt.test.ts`：跨閘門合併、紅線不併入、reset 前的 sheet 不重開寬限、`everyTime` 每次問、
    舊金鑰 prime／reset、失敗型別保留、`unsupported` 退回 expo。
  - `rootKey.test.ts`：一個 signer 一次、另一個意圖再問、60 秒過期、拒絕不被記住、推導走一般閘門。
  - `sensitiveActionPolicy.test.ts`：沒有紀錄 → `redLineOnly`、v3 明確選擇保留、v1/v2 → 預設、壞 v3 → `balanced`。
  - `spruceDid.parity.test.ts`：舊金鑰 iOS 一次 prime 蓋兩個簽章；Android 舊金鑰不疊 JS prompt；自己的 QR 不問。
- `bun run typecheck && bun run lint && bun run test`（commit 前，全部改動）：typecheck 0 error；lint 0 error（206 warning，跟 base 一樣）；unit 1598 pass／0 fail；parity 80 pass／0 fail。

## 沒跑到的

- **模擬器 E2E 沒跑成**。2.0.0 的 dev client 是 RN 0.86.3；另一個 session 的 sim 上那份 app binary 一開始被
  dev client 預設連到 aniseekr 的 Metro。改連自己的 Metro 後，在 load 200–590 下 sim 畫面凍結。從本 worktree
  重 build native（為了驗 Swift 改動）時，Mac 磁碟滿了（ENOSPC），build 失敗。已刪掉自己建的 sim、Pods、
  DerivedData。所以：
  - **Swift `primeSignSession`／`resetSignSession` 沒有編譯過**，只過了 `swiftc -parse`，以及 nitrogen 產生的
    protocol 簽名比對。下一次 iOS build（Xcode Cloud 或本機 archive）是第一次真編譯。
  - 預設 `redLineOnly`、自己的 QR 不問，都沒有在 App 裡實際點過，只有帳本和單元測試證明。
- 舊 Secure Enclave 金鑰：模擬器沒有 Secure Enclave。evaluated LAContext 經 `kSecUseAuthenticationContext`
  滿足 `.userPresence` ACL 是 Apple 文件寫的行為；實際效果要在 Kidney 的實機上確認。最壞情況是退回改動前的
  雙重 prompt，不會少一道閘。
- Android：沒有改行為（Kotlin 只加 stub），沒跑。
- 護照（NFC）、Pear（兩台手機）、掃描（相機）、passkey sheet（模擬器沒 iCloud）：只在帳本量，或沒量。
