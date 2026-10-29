# 10 — 精簡與社群驗證（zkTLS）plan

> 2026-10-29 · 狀態：**plan，§8 已 grill（決議見 §8），尚未動 code**。
> 本文件是 06 之後的批次 plan：把 App 收斂成 5 條 user story，並把「社群驗證」做成差異化核心（zkTLS）。
> 與 06 的關係：06 的 Q1（Pear 留）、Q3（不做透明日誌）、Q5（NIP-44 延後）不變；**Q2（card-key↔root 長效綁定）作廢**（名片改由 root 簽，見 §4）；Q6（憑證皮夾留在二層）不變，但不進主線 story。

---

## 0. 決策帳

| # | 決策 | 理由 |
|---|---|---|
| D1 | **社群驗證直上 zkTLS**，用自架 **TLSNotary**（MIT/Apache）。不用 OAuth、不登入第三方帳號、不在 webview 擷取。 | 差異化核心。TLSNotary 是開源、沒有按次計費、官方手機 client 就是 Expo/RN + UniFFI Rust prover，與我們的技術棧一致。Reclaim 的 attestor 是 AGPL、託管版要付費；Primus 每個 appID 只有 100 次免費證明。 |
| D2 | **一條驗證引擎吃所有平台**：「公開頁 `https://<platform>/<handle>` 的回應裡含有我的標記」。各平台只差一條抽取規則（bio 在哪個欄位）。 | 一套 UX、一套程式碼。2026-10-29 實測：X、Threads、LinkedIn、IG、Telegram 不登入 GET 一次公開頁，原始 HTML 就有 bio。 |
| D3 | **三層見證，能本地就本地**（§3.4）：當面交換由對方手機見證、App 遠端查看由看的人自己重抓，兩層都不經伺服器；只有網頁與離線查看用 notary 簽的證據當可攜備援。擁有者自己的手機不能當見證者（它持有 TLS 金鑰，能捏造內容）。 | 照實說明信任模型（TLSNotary 2026-06「Zero-knowledge ≠ trustless」：zkTLS 只能說服在場的那一方）。 |
| D4 | 標記用 **`creds.id/@name`**（本身就是一個有用的 bio 連結）。X 若把它改寫成 t.co，退回成 `creds:name` 這種不像網址的標記。 | 用戶最容易接受的標記就是自己的頁面連結。t.co 問題要在 spike 用真帳號確認。 |
| D5 | ~~驗完可移除標記~~ **（grill Q3 推翻）標記留在 bio，背景自動續驗**：徽章超過 30 天，擁有者 App 開啟時就用 Proxy 模式靜默重證；超過 90 天沒續上就降成灰色「曾於 YYYY-MM-DD 驗證」；續驗失敗只通知擁有者一次。 | 綠勾代表「現在」成立。標記就是用戶自己頁面的連結，留著幾乎沒成本；同時解決帳號轉手與 notary 金鑰外洩後的恢復。 |
| D6 | **PGP 不進 v1**。 | 簽 challenge 需要用戶在別的 app 操作私鑰，做不到「點擊＋確認」。之後可用 Keyoxide 式的 notation 再評估。 |
| D7 | **Bluesky、Nostr 維持現有雙向綁定**（OAuth 寫 PDS 紀錄／kind-0 `alsoKnownAs`），不改走 zkTLS。 | 已經是最強的雙向證明，而且已上線。 |
| D8 | **網站也走同一條 zkTLS 引擎**（首頁裡有標記連結），取代 `did.json`／rel=me 只在擁有者 App 裡跑的現況。DNS TXT 留作進階選項，不放主流程。 | 一條流程；rel=me 和 `did.json` 在網頁端會被 CORS 擋，現在看的人根本看不到結果。 |
| D9 | **QR 只剩兩種**：離線版（片段 URL，root 簽，≤2048 bytes）和 online 版（`creds.id/@name`）。chunk QR（sqc1、CRD1、solb 以外的名片 wire）全部 deprecated。 | 見 §4 的依賴處理。 |
| D10 | **護照 ZK 維持 L3**，但 UX 隱性化：掃護照 → 背景出證 → 頁面多一個徽章。Android 降級成 SD-JWT 時照實顯示 `white`。 | 見 §5。 |
| D11 | **Nostr 發佈、iCloud/Drive 備份保留**。 | 北極星的骨幹。 |
| D12 | **測試瘦身**：只留安全／密碼學／解析邊界與真 bug 的回歸測試；新增 Maestro e2e 對應 5 條 user story。 | 見 §6。 |

---

## 1. User story（主線只有 5 條）

1. **建立**：我用 passkey 建一個 creds.id 身分，不必管金鑰或 DID。
2. **我的頁＋驗證**：我加上 IG／X／GitHub／網站等連結，每個連結點一下、照指示貼一次標記、回來確認，就亮綠勾。
3. **出示**：當面打開一張漂亮的 QR 卡，對方掃了就看到我的頁和每個綠勾。
4. **收人**：我掃別人或用 Pear 交換，People 會在我手機上重驗他的簽章和每個 attestation。
5. **證明**：我掃一次護照，頁面上就多一個 L3 徽章，ZK 在背景完成。

二層（不進主線）：憑證皮夾、OIDC、websign、Settings。

---

## 2. 驗證 UX：點擊＋確認

唯一不能自動化的一步是「把標記放進平台 bio」（平台沒有開放寫 bio 的 API，也不該讓用戶把密碼交給我們）。其他全部自動。

```
[連結列] 點「驗證」
   │
   ▼
[驗證 sheet] 一個主按鈕：「複製並打開 X」
   │  ① 複製 creds.id/@name 到剪貼簿
   │  ② 打開平台 app／網頁的個人檔案編輯頁（有 deep link 就用，沒有就開個人頁）
   ▼
用戶在平台裡貼上、儲存（唯一手動步驟）
   │
   ▼
回到 creds.id（AppState 回前景自動觸發，不用再按）
   │  ③ 背景跑 zkTLS：GET 公開頁 → 找到標記 → 產生 attestation（目標 1–3 秒）
   ▼
[確認卡] 「在 X @name 找到你的標記」＋ 預覽徽章
   │  ④ 用戶按「加上綠勾」→ root 簽新的 Page 紀錄（宣稱 x:@name）並發佈——整個流程唯一一次 Face ID
   ▼
連結列亮綠勾；之後每 30 天背景靜默續驗，不再打擾用戶
```

步驟 ③ 的 notary 請求用 npub 金鑰做 NIP-98 簽章（不需要 Face ID，見 §8 Q5），所以回到 App 時能直接開始證明。

失敗時只有三種狀態，各給一個動作：

| 狀態 | 畫面 | 動作 |
|---|---|---|
| 還沒找到標記（平台快取、還沒存） | 「還沒看到，平台可能需要幾秒更新」 | 自動重試 3 次，再給「再試一次」 |
| 平台擋住（資料中心 IP 被擋、登入牆） | 「X 暫時擋住了驗證」 | 有 MPC verifier 時給「改用手機網路驗證」（見 §3.3）；沒有時說明「網頁訪客會看到請在 App 裡查看」，Page 宣稱照樣成立 |
| notary 連不上 | 「驗證服務暫時無法使用」 | 稍後再試；不會降級成假綠勾（Rule 8） |

---

## 3. zkTLS 架構

### 3.1 元件

| 元件 | 位置 | 說明 |
|---|---|---|
| **prover** | `nitro-modules/attest`（新增 HybridObject）| 搬 TLSNotary `tlsn-mobile` 的 Rust prover（UniFFI）。ArrayBuffer 參數照 CLAUDE.md 規則先同步複製。 |
| **平台規則表** | `packages/shared/src/zktls/platforms.ts` | 每個平台：URL 模板、要揭露的回應區段（meta tag／JSON path）、標記比對。純資料＋純函式。 |
| **證據驗證器** | `packages/shared/src/zktls/`（`evidence.ts` 驗證據、`request.ts` 是 notary 的 NIP-98 閘門） | App 與網頁共用、純 TS：驗證據 JWS 的 notary 金鑰鏈（root → 月度憑證 → JWS）、server 是平台網域、bio 含標記、請求路徑等於宣稱的 handle，再沿名稱證據與 npub 綁定接到 DID（§3.5）。**不需要 tlsn WASM。** |
| **notary** | Gimmy 帳號下的 **Cloudflare Container**（`durable_object` scheduling），前面一個 Worker 轉接 WebSocket 並負責簽章 | **P0 實測（docs/e2e/2026-10-29-zktls-spike）**：Worker 的 TCP socket 連不到 Cloudflare IP，而 x.com、t.co、LinkedIn 都在 Cloudflare 後面，所以 Worker 版 notary 不可行；原生 Rust verifier 放 Container 已端到端證明 X／Telegram／Threads／LinkedIn／GitHub（2–4.6 秒）。與 kidney 帳號的 `solidarity-id` 是兩個獨立 Worker。 |
| **證據格式** | 我們自己的穩定 JWS（不存 TLSNotary presentation） | `{server, 請求行, bio 原文, 時間, 憑證鏈指紋, tlsnVersion, kid}`，由當月 notary 金鑰簽、附 root 簽的月度憑證。**不放進 Page**：由擁有者的 npub 獨立發佈（Nostr event，creds.id 同步收錄），以 DID 關聯；續驗只換證據、不重簽 Page。不進離線 QR。 |

### 3.2 為什麼只揭露 bio 區段
TLSNotary 對「沒揭露的部分」沒有證明成本（alpha.13 #1006），所以只對 notary 揭露 bio 那一小段：證明快、也不洩漏頁面其他內容。請求本身沒有秘密（不登入），整段揭露，讓 notary 能確認請求的是 `/@name`。notary 見證並驗過之後，把結果簽成上面的穩定 JWS；TLSNotary 只活在連線那幾秒（§8 Q2）。

### 3.3 模式：Proxy 為主，MPC 為備援
- **Proxy**（預設）：notary 代為連線、轉發密文。官方數據：5G 約 1.6 秒，頻寬需求低。風險：notary 在資料中心，IG／LinkedIn 可能擋它的 IP。
- **MPC**（備援）：手機自己連平台，不會被當成資料中心流量擋。代價：要先上傳約 30 MB 的 garbled circuit 資料，5G 約 10 秒。只在 Proxy 被擋時用，並提示用 Wi-Fi。
- 每個平台的預設模式由 spike 結果決定，寫進平台規則表。
- **P0 後更新**：notary 已定為 Container，MPC 備援可以放在同一個 Container 裡。P0 實測只有 IG 擋 Container 出口；LinkedIn 從 Container 是通的。被擋的平台在找到解法前沒有 notary 證據這一層：網頁訪客看到「請在 App 裡查看驗證」，App 遠端與當面兩層照常運作。

### 3.4 三層見證（grill 決議）

| 情境 | 誰見證 | 要信任誰 | 伺服器 |
|---|---|---|---|
| 當面交換（掃 QR 或 Pear） | 對方手機當 TLSNotary verifier（Proxy 模式），替你連到平台、轉發密文；兩支手機經 Pear 溝通 | 無 | 不需要 |
| App 裡遠端看別人 | 看的人的 App 自己重抓對方公開頁（公開資料直接抓就是最強證據） | 無 | 不需要 |
| 網頁、離線、事後查看 | notary 事先簽好的證據 JWS | notary | 需要 |

- 徽章永遠顯示看的人能拿到的最強證據（「剛剛由你的手機見證」優先於「由 creds.id notary 於某日見證」）。
- 當面兩支手機的 tlsn 版本不同時，自動降級成第二層（App 自己重抓），不讓用戶看到錯誤。
- 信任模型照實寫進徽章詳情：隱私與「揭露內容沒被竄改」是純密碼學；「連線真的發生過」在第三層要信任 notary 沒和擁有者串通。之後可升級成 M-of-N notary。

### 3.5 證據鏈：bio → DID（grill Q4）
1. **平台證據**：notary JWS 證明「x.com/alice 的回應含 `creds.id/@alice`」。
2. **名稱證據**：同一流程平行再跑一次 zkTLS，對象是 `creds.id/.well-known/nostr.json?name=alice`，證明「alice → npub」（worker 只回 name → pubkey，`directory.ts:62`）。
3. **npub ↔ DID**：把 npub 簽的 did↔npub 綁定 event 原封嵌進證據包。
4. **DID 簽的 Page** 宣稱 `x:@alice`。

每一段都能離線驗；公司倒了舊徽章照樣成立。名字釋出後永久 tombstone（`airmeishi-backend/src/schedules/index.ts:12`，設計 G3），排除名字轉手。bio 不放 DID 指紋。

### 3.6 notary 金鑰（grill Q1）
- **兩層**：root notary key 離線保存（Kidney 的 YubiKey + 紙本備份），從不上 Cloudflare，公鑰寫死在 `packages/shared`。每年一次離線作業產生 12 把月度簽章金鑰，root 為每把簽 `{kid, pubkey, notBefore, notAfter}` 憑證，上傳成 Worker secret（`NOTARY_KEYS`，只放私鑰；公開的憑證在 `apps/notary/keys/certs.json`）；Worker 每次簽章依日期挑當月金鑰，不需要 cron。輪替不需要發 App。工具：`apps/notary/scripts/keys.ts`。
- **實際（2026-10-29）**：正式 root 是在開發用 Mac 上用 `keys.ts` 產生的（Kidney 決定，為了先上線），12 把月度金鑰已簽到 2027-09；之後把 root 私鑰移到離線儲存並從 Mac 刪除。紀錄：`docs/e2e/2026-10-29-zktls-prod-launch/result.md`。
- **舊證據永遠可驗**：證據自帶月度憑證，看的人只需寫死的 root 公鑰，離線即可驗。
- **外洩**：月度金鑰外洩只能偽造該月份的證據。root 簽撤銷清單發佈到 creds.id 與 Nostr；App 連線時讀到，把該月證據在背景自動重證（前提是標記留在 bio，見 D5）。

### 3.7 版本（grill Q2）
- tlsn 版本固定，跟每季一次的 App 更新一起升級。
- Worker 同時保留「目前版」與「前一版」verifier（涵蓋約兩季未更新的 App）；更舊的擁有者端提示更新，看的人那一端降級成 App 自己重抓。

### 3.8 notary 的邊界與隱私（grill Q5）
- **每次請求都要簽章**：npub 金鑰對 `{平台, handle, nonce, 時間}` 做 NIP-98 簽章（兩端已有實作：`packages/shared/src/nip05/client.ts`、worker 的 register／release／recover）。不用 passkey 或 root：兩者每次都要 Face ID，會破壞背景續驗。
- **只接受 creds.id 已註冊名字的 npub**，限速以 npub 為單位（例如每小時 20 次）。
- **只准連白名單**：平台規則表裡的 host，且只准 GET 個人頁路徑。網站類只准 GET 首頁、限制回應大小，沿用 `httpsOwnership.ts` 的私有 IP／localhost 擋法。
- **不留紀錄**：關掉 observability 與 log 取樣；限速計數只放 DO 記憶體，不寫 D1；證據 JWS 只含公開資料，不含 IP。
- 隱私政策補一句：「驗證時，creds.id 的驗證服務會替你連到該平台的公開頁面，不保存你的 IP 或查詢紀錄。」
- 當面與 App 遠端兩層不經 notary，不受以上影響。

### 3.9 平台清單（2026-10-29 實測，全部支援 TLS 1.2 + AES-GCM）

| 平台 | 抓什麼 | bio 位置 | 回應大小 | 預估難度 |
|---|---|---|---|---|
| Telegram | `t.me/<name>` | `og:description` | 11 KB | 低 |
| X | `x.com/<name>` → `t.co/<id>` | `<meta name="description">`；bio 裡的網址一律變成 t.co，所以要再證明 t.co 頁的 `<title>` 是 `creds.id/@name`（兩跳，P0 已實測） | 186 KB + 1.4 KB | 中 |
| GitHub | `github.com/<name>`（或 `api.github.com/users/<name>`） | bio／blog 欄位 | 待測 | 低 |
| 網站 | `https://<domain>/` | 頁面裡的標記連結 | 依網站 | 低 |
| Threads | `threads.com/@<name>` | `og:description` | 614 KB | 中 |
| LinkedIn | `linkedin.com/in/<name>` | `description`（headline + About） | 681 KB | 高（登入牆、擋 IP） |
| IG | `instagram.com/<name>/` | 內嵌 JSON | 693 KB | 高：Container 出口被導去登入頁（P0）；只有 Worker socket 拿得到。待試「Container 經 Worker `connect()` 轉接」，在那之前沒有 notary 層 |
| YouTube | 頻道頁 | 不在 meta，藏在約 1.3 MB 的頁面資料 | 1.3 MB | 最後做 |

### 3.10 X：個人頁「網站」欄位（2026-10-29 plan）

**目標**：X 的標記放在**簡介或「網站」欄位**都能驗證；一次 notary 見證，不再跳 t.co。

**實測（x.com/kidneyweakx，未登入，iPhone UA）**：頁面裡內嵌 X 自己的 GraphQL 結果，形狀是 JS 字串
`value:"{\"data\":{\"user_result_by_screen_name\":…}"`，出現 3 次：

| 順序 | 大小（跳脫後） | 內容 |
|---|---|---|
| 1 | 707 B | 精簡個人資料：`core.screen_name`、`profile_bio.entities.description.urls[].expanded_url`（簡介裡的連結，**已展開**，例：`https://creds.id/@kidneyx`）；**沒有網站欄位** |
| 2 | 2185 B | 完整個人資料：同上，另有 `profile_bio.entities.url.urls[].expanded_url`（網站欄位） |
| 3 | 25 KB | 時間軸，沒有 `core.screen_name` |

這段 JSON 自帶 `screen_name`，所以驗證端可以**整段解析**後確認擁有者，不用靠位元組樣式猜邊界。

**設計**
1. **新證據平台 `x-profile`**（`platforms.ts`；只是證據種類，不是 Page claim，claim 仍是 `x:@handle`）：
   `x.com/<handle>`，揭露範圍起點 `{\"data\":{\"user_result_by_screen_name\":`，終點是這個 JS 字串的結尾（第一個**沒被跳脫**的 `"`）。
2. **prover（`nitro-modules/attest/zktls/src/lib.rs`）**：`ProveRequest` 加兩個可省略欄位：
   `fieldStopUnescaped`（終點略過 `\` 跳脫）、`fieldContains`（從起點的各次出現裡，挑**第一個包含此字串**的範圍；App 傳 `creds.id/@<name>`）。
   範圍挑選抽成純函式並寫 Rust 單元測試。舊欄位行為不變（Telegram／GitHub／名稱證據照舊）。重編 xcframework → creds-app release `zktls-v0.2.0`（pre-release）→ 更新 `prepare-ios-workspace.sh` 的版本與 SHA。
3. **shared 驗證器（tdd）**：
   - `checkEvidenceFacts`（notary 簽章前與驗證端都跑）對 `x-profile`：揭露位元組以起點開頭、中間沒有未跳脫的 `"`；JS 字串解跳脫（只接受 `\" \\ \/ \n \r \t \b \f \uXXXX \xXX`，其他一律拒絕）→ `JSON.parse` → `data.user_result_by_screen_name.result.core.screen_name` 與 handle（不分大小寫）相同，否則拒絕。
   - 標記只認 `result.profile_bio.entities.{description,url}.urls[].expanded_url`，且必須完全等於 `https?://(www.)?creds.id/@<name>`（可有結尾 `/`）。其他位置（置頂推文、highlights、display_url）一律不算。
   - `verifySocialProof`：claim 是 `x` 時，profile 證據可以是 `x`（舊：簡介 meta＋t.co）或 `x-profile`（新，不需要 links）。
   - 證據 `revealed` 上限 4096 → 8192（完整個人資料約 2.2 KB，留空間給長簡介／認證標籤）。
   - 版本 shared 2.0.7。
4. **notary**：Container 不改（已要求剛好一段揭露、回應 ≤ 2 MiB）；Worker 吃新 shared 後重新部署 dev 與正式。
5. **App（`zktls/engine.ts`）**：X 先跑 `x-profile`（`fieldContains = creds.id/@<name>`）；如果 X 不再內嵌這段資料（`fieldMissing`），退回舊的簡介＋t.co 路徑。X 的說明文案改成「貼進個人簡介或『網站』欄位」。
6. **網頁**：重新 vendor shared 2.0.7（舊 viewer 的證據 schema 不認得 `x-profile`，會顯示未驗證），部署 creds.id。

**順序**：shared（tdd）→ prover（Rust 測試＋CLI）→ notary dev 部署 → CLI prover 對 dev notary 實測 x.com/kidneyweakx → notary 正式部署 → 網頁 vendor＋部署 → xcframework release＋pin → App engine＋文案 → commit／push。

**E2E 能做到的**：CLI prover（就是 App 的 prover 程式碼）經 dev notary 見證 x.com/kidneyweakx，用 dev root 離線驗證；簡介標記走完整個 `x-profile` 驗證；網站欄位用 `fieldContains=kidneyweakx.com` 證明挑到完整資料那一段。
**做不到、要擁有者做的**：網站欄位的正向驗證要把 X 網站欄位改成 `creds.id/@kidneyx`；手機上用正式 notary 跑一次（需要已註冊名稱的 npub）。

**grill 結果（2026-10-29，沒有需要使用者決定的產品問題）**
- **別人能不能偽造起點？** 不能。起點需要「`{` 後面直接接 `\"`」；別人的推文、名稱、簡介在這段資料裡都被再跳脫一層（`"` → `\\\"`、`\` → `\\\\`），在 HTML meta 裡 `"` 變 `&quot;`，都湊不出這個序列。就算湊出來，驗證端還要整段 JSON 解析成功、`screen_name` 等於 handle、標記在指定路徑，三者都過才算。
- **擁有者自己能不能動手腳？** 揭露範圍只能有一段、從起點開始；內部引號全被跳脫，所以截短的範圍不會是完整 JSON（`JSON.parse` 拒絕）。請求行仍要是 `GET /<handle>`。
- **選錯那一段**：`fieldContains` 讓 prover 挑第一個含標記的段落；標記在簡介 → 挑到 707 B 的精簡段（證據小），只在網站欄位 → 挑到完整段。哪一段都可以，驗證端只看內容。
- **X 改格式**（不再內嵌、改用 `\/`、換路徑）→ prover `fieldMissing` 或驗證失敗，一律失敗不會誤過；App 退回簡介＋t.co 舊路徑，所以舊路徑程式保留。
- **大小**：完整段約 2.2 KB；上限 8192。整份 SocialProof 約 6 KB，在中繼站事件大小內。
- **相容**：已裝的 App（prover v0.1.0）照舊走 `x`；舊網頁 viewer 不認得 `x-profile`，所以網頁要在 App 發佈新證明之前更新（順序已排）。
- **大小寫**：`screen_name` 與 handle 不分大小寫比對；改名後舊 handle 會 301 → prover 狀態錯誤。
- **JS 字串跳脫**：另外接受 `\'`（合法 JS）；其他未知跳脫一律拒絕。
- **頻率**：退回舊路徑最多多一次 session，仍在每小時 20 次內。

### 3.11 本地優先：四層背書，notary 退役（2026-10-30 plan，取代 §3.4 的三層見證與 §3.1 的 notary）

**為什麼改**（Kidney，2026-10-30）：
- 伺服器要盡量輕。notary 讓每個綠勾都要信任我們的伺服器，和北極星「公司倒了還能運作」衝突；Container 雖然閒置會停（最多約 US$28／月），但按連結數和重驗頻率成長。
- 從用戶自己的裝置去抓公開頁，不會集中被平台封鎖，也不受 Cloudflare 出口規則影響。
- 公開資料不需要 ZK：zkTLS 的 ZK 只是對見證者隱藏內容，簡介本來就公開。真正的問題是「誰背書」。
- 擁有者自己簽的 zkTLS 不算證據：TLS 金鑰在擁有者手上，可以捏造內容。只用 TEE 也不夠：Secure Enclave 簽的是 App 交給它的任何東西，抓頁面和解析都在 App 程序裡。要再加 Apple／Google 的平台證明（attestation），證明「這把金鑰屬於沒被改過的 creds App、在真的手機上」。

**四層背書**（徽章永遠顯示看的人能拿到的最強一層）

| 層 | 誰背書 | 適用 | 要信任誰 | 伺服器 |
|---|---|---|---|---|
| 1. 平台自己簽 | 平台的簽章 | Bluesky（帳號紀錄）、Nostr | 平台金鑰 | 不需要（已上線） |
| 2. 發證單位晶片簽 | 政府 | 護照（同 My Number 卡、自然人憑證） | 發證國 | 不需要（已上線） |
| 3. **裝置證明（新）** | Apple App Attest／Android Key Attestation 背書的硬體金鑰 | X、Telegram、GitHub、網站（之後 Threads） | Apple／Google ＋ 該手機沒被越獄或解鎖 | 不需要；網頁也能離線驗 |
| 4. **看的人自己抓（新）** | 看的人的手機 | 同上，App 內即時查看 | 只信自己的連線 | 不需要 |

**第 3 層：裝置證明**
1. **建立裝置金鑰**（每支手機一次）：
   - iOS：`DCAppAttestService` 在 Secure Enclave 產生金鑰，`attestKey(challenge = SHA256(npub))` 取得 attestation 物件（x5c 憑證鏈到 Apple App Attestation Root CA，RP ID = SHA256(`<TeamID>.kidneyweakx.airmeishi`)，aaguid 必須是正式環境 `appattest`）。
   - Android：KeyStore 產生硬體金鑰並設 `setAttestationChallenge(SHA256(npub))`，憑證鏈到 Google Hardware Attestation Root；`attestationSecurityLevel` 必須是 TrustedEnvironment 或 StrongBox，`attestationApplicationId` 必須是我們的套件名稱＋簽章摘要，`verifiedBootState = Verified` 且 `deviceLocked = true`。
   - challenge 用 npub，把裝置金鑰綁到擁有者身分，不需要伺服器發 challenge。
2. **產生證明**：擁有者的 App 直接用系統網路抓公開頁（`URLSession`／`OkHttp`，不用 TLSNotary），用 shared 的平台規則（`parseXProfile` 等）取出欄位、確認標記，再用裝置金鑰簽 `{platform, handle, name, npub, 揭露內容, 時間}`（iOS 是 assertion，Android 是 KeyStore 簽章）。最後外層再用 npub 做 nostr 簽章並發佈。
3. **驗證**（shared，App 與網頁共用，純 TS、離線）：裝置憑證鏈到釘選的 Apple／Google 根 → 金鑰屬於我們的 App 且符合上面的條件 → 簽章蓋過的內容 → 揭露內容通過平台規則 → npub 與 Page 綁定（§3.5 的名稱證據改成 Page 自己宣告的 npub＋creds.id 名稱，由驗證端直接查）。
4. **重驗**：擁有者的 App 每 30 天在背景重抓重簽，免費，不經伺服器。

**第 4 層：看的人自己抓**：看的人的 App 打開別人的 Page 或掃 QR 時，自己抓對方的公開頁，用同一套規則檢查，顯示「你的手機剛剛驗證」。當面交換也走這條，不需要兩支手機跑 TLSNotary（原 P2.5 刪除）。

**p2p 見證：別人的手機替你背書**（Kidney，2026-10-30：「見證方要做到別人手機」）
- 看的人的 App 做完第 4 層、檢查通過後，可以按「幫 @對方 見證」，發佈一則見證：內容是 `{platform, handle, 對方 npub, 看到的揭露內容, 時間}`，用見證者自己的 npub 簽，再加見證者手機的裝置證明（第 3 層的同一把硬體金鑰）。
- 裝置證明在這裡的用途是**防分身**：每一則見證都要對應一支真手機上沒被改過的 App，擁有者想灌見證就得準備很多支真手機。
- 當面交換（掃 QR）是最自然的時機：兩支手機互相檢查對方的連結，各自提示「幫對方見證」，互相背書。
- **只在使用者主動按下時才發佈**（grill 決議，2026-10-30）：見證是公開的，等於公開「我認識這個人」；只瀏覽 Page、或掃了 QR 但沒按，都不發佈。
- **2.0.0 一次到位**（grill 決議，2026-10-30）：第 3 層裝置證明、第 4 層看的人自己抓、「幫他見證」與網頁上的見證顯示都在 2.0.0 上線，不先出只有 App 內檢查的版本。
- **notary 整套移除**（grill 決議，2026-10-30）：2.0.0 出貨前刪掉 notary Worker／Container（停用並刪除部署）、TLSNotary prover（Rust crate、xcframework、CI 的 `zktls-v0.2.0` 固定版本）、notary 簽章證據與 t.co 跳轉；保留平台規則與 `parseXProfile`（第 3、4 層都用）。不留隱藏備援。
- **不做 zk-email**（grill 決議，2026-10-30）：DKIM 信件 ZK 證明是唯一「任何人都能驗、不需信任誰」的社群證明，但取原始信、DKIM 換鑰、每個平台的信件格式會讓複雜度不斷上升，和拿掉 notary 的理由相同。
- **護照讓 nostr 身分成為可信的真人（免 KYC）**（Kidney，2026-10-30）：護照 ZK 證明綁在持有者的 DID，Page 再宣告 npub，所以見證者的 npub 背後是一個持有有效護照的真人，而且不揭露任何護照資料。這種見證標示「已用護照驗證的見證者」，分量高於只有裝置證明的見證。Android 退回 SD-JWT（`trustLevel: 'white'`）的不算護照 ZK。現況：護照證明沒有 nullifier，同一本護照可以撐起多個 npub。
- **2.0.0 加護照 nullifier**（grill 決議，2026-10-30）：passport-noir 目前沒有任何 nullifier（`circuits/` 全部查過），要在 OpenAC v3 的 show 電路新增一個以用途為範圍的 nullifier 公開輸出，網頁才能算「N 位不同的真人見證」。連帶工作：重新產生 proving key 與 SRS（CI 的 SRS 固定版本要一起換）、護照全流程實機重驗。屬於安全路徑，L。
- **nullifier 全域一個範圍：一本護照只對應一個護照見證 npub**（grill 決議，2026-10-30）：同一個人換再多 npub，網頁都只算一位真人；他用過的見證 npub 會因此被公開連在一起（見證本來就是公開表態）。換 npub 時，新的 Page 取代舊的綁定，舊 npub 的護照標示失效。
- **晶片簽章不強制，照實揭露**（grill 決議，2026-10-30）：護照證明只檢查資料上的發證國簽章，沒用晶片私鑰（Active／Chip Authentication），所以掃過晶片的人（飯店、機場）拿到資料副本也能做出同樣的證明與 nullifier。2.0.0 不強制晶片簽章，徽章詳情照實寫出這點；冒用者頂多冒充一位護照見證者，而 nullifier 只對應一個 npub，本人發一次新的 Page 綁定就能取回。之後再評估（需先實測台灣、日本護照是否支援 AA／CA）。
- **網頁的 Android 撤銷檢查走快取轉發**（grill 決議，2026-10-30）：creds.id 加一支 Pages Function，把 Google 公開的 `android.googleapis.com/attestation/status` 原封不動轉給瀏覽器，快取一天；比對與驗證全在瀏覽器做，函式不判斷任何證明。函式掛掉時網頁顯示「暫時無法確認撤銷狀態」，其他驗證照常。
- **預設值**（提出後未被反對，2026-10-30）：見證保留 90 天，過期不計；人數以裝置計，同一支手機換 npub 只算一次（有護照 nullifier 時以 nullifier 計）；擁有者 App 每 30 天在背景重抓重簽；沒有硬體 attestation 的舊 Android 只能在 App 內檢查，不能見證也不能自證。
- **待提供（非決策）**：Play Console 的 **app signing 金鑰 SHA-256**，用來釘選 Android `attestationApplicationId` 的簽章摘要（同 passkey assetlinks 的缺口）。
- 顯示：網頁訪客看到「N 支手機見證，最近一次 X 天前」；App 裡看的人另外看到見證者中有沒有自己的聯絡人（「你的聯絡人 Bob 見證過」）。
- 擁有者自己的裝置證明（上面第 3 層）保留給**冷啟動**：還沒有人見證時，網頁仍有一個由真機簽出的勾勾；有人見證後，見證的分量更高。
- 擁有者不能替自己見證：見證者 npub 不得等於 Page 的 npub，裝置金鑰也不得與擁有者自己證明用的是同一把。

**伺服器剩下什麼**：creds.id 名稱目錄（已有）、Page 的邊緣快取（§3.12 網頁速度）。notary Worker＋Container、TLSNotary prover（`zktls-v0.2.0`）在第 3 層上線後退役。

**限制（照實寫進徽章詳情）**
- 越獄或已 root 的手機配合攔截工具，仍可能在送進 TEE 前竄改內容；平台證明只能把門檻提高，不能完全排除。徽章寫「由 creds App 在真機上驗證」，不寫「無法偽造」。
- App Attest 的計數器遞增檢查需要保存狀態，離線驗證端做不到；同一份證明可以被重複出示，但內容綁了時間與 npub，重複出示不會變成別人的證明。
- 模擬器不支援 App Attest，只能在實機測。
- 沒有硬體 attestation 的舊 Android 拿不到第 3 層，只剩第 4 層（網頁顯示「下載 App 驗證」）。
- Android 撤銷清單在 Google 的公開網址，需要連網；App 直接查，網頁見 grill 結果。

**速度**：不再跑 TLSNotary，只是一般 HTTPS 抓頁加一次硬體簽章。實測（2026-10-30，Mac 直連）：x.com 0.46–0.50 s、GitHub 0.07–0.77 s、t.me 0.8 s（首次 2.5 s）；現行 TLSNotary 經 notary 是 4.5–7 s（container 冷啟動 15 s）。裝置金鑰的 attestation 只在每支手機第一次做（要連 Apple，約 1 s）。嚴格說這已經不是 zkTLS，是「裝置證明」。

**grill：自行查證後已解決的問題**
- **拿別人的 attestation 物件來用？** 沒用：沒有那把私鑰就簽不出新內容。attestation 的 challenge 是 SHA256(npub)，驗證端要求它等於證明裡、也等於 Page 宣告的 npub，所以裝置金鑰不能借給別的身分。
- **開發版金鑰**：正式驗證只接受 App Attest 正式環境（`appattest`）與 Android 鎖定開機；開發版（`appattestdevelop`）只在 dev 驗證模式接受，E2E 用這個。
- **Android 的 Play 簽章**：`attestationApplicationId` 裡是安裝檔的簽章摘要，也就是 **Play app signing 金鑰**，不是上傳金鑰；目前手上沒有這個摘要（同 passkey assetlinks 的缺口），要先從 Play Console 取得再釘選。
- **Android 短效憑證（RKP）與撤銷**：在證明宣告的時間點檢查憑證有效期，且該時間不得晚於現在；超過 90 天的證明本來就顯示過期，回填舊時間占不到便宜。撤銷清單在 App 直接查。
- **隱私**：不要求 Android ID attestation（不放裝置序號）；App Attest 金鑰只在本 App 內穩定，公開後能把同一人的證明串起來，但它們本來就以 npub 串在一起。
- **RSA**：Google 舊根是 RSA-4096，Hermes 沒有 WebCrypto，用 BigInt 自行實作 RSA PKCS#1 v1.5 驗章（tdd），不引入依賴 WebCrypto 的函式庫。

**實作量**：iOS／Android 各一個原生模組（App Attest、Key Attestation）；shared 新增 CBOR、DER／X.509、Android 擴充欄位解析與憑證鏈驗證（安全接縫，tdd）；RSA 驗章用 BigInt 純 TS 實作；passport-noir 新增 nullifier（電路、proving key、SRS）；見證的發佈、讀取與網頁顯示。屬於 L，分階段、每階段一次實機 E2E。

### 3.12 網頁速度（2026-10-30 診斷）

`/@gimmy` 載入實測 13–20 秒。原因：`fetchLatestEvent` 用 `Promise.all` 等**所有**中繼站回 EOSE 或 4 秒逾時；只要一個中繼站卡住（damus 偶發首連失敗），每一步就等滿 4 秒，而一頁要串名稱 → 指標 → Page → 徽章 → 每個連結的證明好幾步。修法（依效果排序）：
1. `/@name` 的 Pages Function 本來就解析名稱，順便把最新的已簽 Page JWS 放進 HTML，用 Cloudflare 快取約 60 秒；瀏覽器照樣驗簽章，快取無法偽造。中繼站改在背景更新。
2. 第一個中繼站回應後，最多再等約 300 ms 就繼續，不等全部。
3. 每個連結的見證合成一次查詢（多個 `#d`），不再一條連結一條連線。
4. 瀏覽器記住上次驗證過的 Page，再次造訪時立刻顯示。

---

## 4. 一個身分、一張卡、一種 QR

- 對外的所有內容都由 root `did:key` 簽。硬體鑰只留給護照做裝置綁定，不再露出。刪 `settings/dids`。06 的 Q2 作廢。
- QR 卡就是 Page 紀錄的投影：online 版是 `creds.id/@name`，離線版是片段 URL（只放名字、連結、did；不放 Page 外觀和 zkTLS 徽章）。
- 刪 `/cards/edit`（Swift 移植的名片表單）、名片 wire、Present 的 Attestations 分頁。
- 掃描端只認 Page URL 與片段。舊 wire 給一個版本的過渡期後移除。
- **chunk QR 的兩個依賴要先處理**：
  - 護照 ZK 當面出示（`useShowPresentation.ts` 的 sqc1 多頁 QR）→ 改走 Pear；平常用 Page 上的 L3 徽章。
  - websign 傳輸（`websign/transport.ts`）→ 08 plan 的 passkey PRF 同步上線後評估整個移除。

---

## 5. 護照 ZK（L3）隱性化
- 流程縮成「掃 MRZ → NFC → 背景出證 → 徽章」。刪 evidence-pack、`id/zk-settings`；`/passport` 只剩掃描流程本身。
- 看的人驗 public disclosure（網頁已有 `verifyDisclosureBadge`）。
- groups／Semaphore 已凍結，這版刪除路由與 UI（native 模組保留，等另一刀）。

---

## 6. 測試精簡

現況：`__tests__/unit` 162 檔、約 3.55 萬行，大約是 `src` 的一半，超過全域規則「測試要遠少於產品碼」。

- **保留**：`rootKey`、`didKeyCredential`、`httpsOwnership`（SSRF 防護）、`atprotoDpop`／`atprotoPkce`／`atprotoDiscovery`、`proofVerifierHolderBinding`、`passportShowVerifier`、`sensitiveActionPolicy`、`motionWorklet`（抓過 release crash），以及 parity 與 `packages/shared/test` 的密碼學向量。
- **P1 實際執行（2026-10-29）**——逐檔核對後修正了原清單：
  - 刪：2026-09-28 那次清理留下未 commit 的 57 個檔（surface／讀原始碼／UI 文案測試）；`sakuraBlob`×2、`shamir`（功能已刪）；`groupE2E`／`groupStore`／`groupRecovery`（groups 凍結、P5 刪）；`sharingSettingsStore`（純持久化）；`routeActionIntegrity`（掃原始碼，`typedRoutes` 已由 tsc 檢查路由）；`qrCodeManager` 裡讀原始碼的那一條。
  - **改判保留**：`profileStore`（root 簽章、Face ID 被拒、私人連結不上 relay 的投影＝安全邊界）、`pageDesignStore`（清除資料時不復活）、`proEntitlementStore`（金流）、`issuerStore`（只收 https）、`oidcParse`（OAuth discovery https＋host 驗證，threat model）、`oidcRequestQr`、`iosBuildEnv`（每條對應一次真實的 Xcode Cloud 壞掉）、`cloudSyncEngine`／`cloudSyncModel`（備份保留）、`leaveCardInbox`（功能仍在）、`ethereumRpc`（ENS 程式碼移除時再刪）。
  - chunk QR 棄用（P4）時再刪 `qrChunking`／`qrCompression`／`qrEnvelopeWire`／`solidarityQrPayload`／`crd1Envelope`。
  - 結果：unit 162→154 檔、1667→1590 個測試、13.6→11.7 秒；parity 78 不變。
- **新增**：
  - 證據驗證器用 `tdd`（解析＋密碼學邊界）：偽造 notary 簽章、月度憑證非 root 所簽、證據時間落在憑證有效期外、kid 在撤銷清單內、server 不是平台網域、bio 不含標記、請求 handle 與宣稱不符、名稱證據的 npub 與綁定 event 不符、綁定 event 的 DID 與 Page 不符（複製攻擊）——全部要拒。
  - notary Worker 的請求閘門用 `tdd`：NIP-98 簽章無效／過期／重放、npub 未註冊、host 不在白名單、非 GET 或非個人頁路徑、私有 IP——全部要拒。
  - Maestro 5 條 flow（每條 user story 一條），放在 `apps/expo/.maestro/`，模擬器 Debug build 跑，截圖存 `docs/e2e/`。掃 QR 用 deep link 注入；NFC 護照只能實機手測。
  - **限制**：onboarding 最後一步會把名字註冊到正式 creds.id 目錄並發佈到公開 relay（`NIP05_SERVICE_ORIGIN` 寫死）。flow 要走完整條，需要先讓 dev build 能指向本機 creds.id worker（wrangler dev）與本機 relay；在那之前 flow 停在 Links 步驟。
  - 網頁 viewer 用 Playwright 開固定測試頁，確認徽章狀態。

---

## 7. 執行階段（每階段結尾一次真實 E2E）

| 階段 | 內容 | 結束時的 E2E |
|---|---|---|
| **P0 spike**（丟棄式） | ① TLSNotary mobile prover 在 iOS 實機跑 Proxy 模式，對 X 和 Telegram 出證明；量耗時、流量。② verifier 編成 WASM 跑在 Worker + DO（128 MB、CPU 上限、`cloudflare:sockets`）；不行就試 Containers。③ 從 Cloudflare 出口連各平台會不會被擋。④ TLSNotary IO channel 能否接上 Pear（當面見證）。⑤ 用真帳號測 X 的 t.co 改寫。 | `docs/e2e/<date>-zktls-spike/result.md`：決定 Worker 或 Container、每個平台的模式與標記、當面見證是否可行 |
| **P1** 測試瘦身＋Maestro 骨架 | §6 的刪除與 Maestro 第一條 flow | Maestro 跑過「建立」flow |
| **P2** 驗證引擎 | prover Nitro 模組、shared 證據驗證器（tdd）、notary Worker（NIP-98 閘門 tdd、白名單、兩層金鑰、依日期輪替）、名稱證據、平台規則表（Telegram、X、GitHub、網站）、§2 的 UX、30 天背景續驗 | 實機：X 與 Telegram 從點擊到綠勾；網頁 viewer 看到同一個綠勾；App 遠端重抓顯示即時結果。**P2a（2026-10-29）完成**：shared 驗證器＋閘門、`apps/notary`（Worker＋Container）部署為 dev，CLI prover E2E 通過 X／Telegram／名稱證據（`docs/e2e/2026-10-29-p2a-notary`）。剩 P2b App prover＋§2 UX、P2c 網頁徽章＋續驗、正式 root 儀式後的 production 部署 |
| **P2.5** 當面見證 | Pear 上的 Proxy 模式 verifier（對方手機見證） | 兩支實機面對面交換，徽章顯示「剛剛由你的手機見證」 |
| **P3** 其餘平台 | Threads、LinkedIn、IG（含 MPC 備援）、YouTube | 每個平台一次實機驗證紀錄 |
| **P4** 一張卡 | §4：root 簽名、QR 兩種、刪名片 wire 與相關畫面、Pear 接手護照出示 | Maestro「出示」「收人」flow |
| **P5** ZK 隱性化與砍併 | §5 與 Settings 收斂 | Maestro 全 5 條 + 護照實機手測 |

每階段結束跑一次 `bun run typecheck && bun run lint && bun run test`。安全路徑（identity、passport、attest 模組）照規則是 L，階段結束做 `/code-review`。

---

## 8. grill 決議（2026-10-29）

| # | 問題 | 決議 | 細節 |
|---|---|---|---|
| Q1 | notary 金鑰放哪、怎麼輪替、舊證據能不能驗 | 兩層金鑰：root 離線（YubiKey），月度金鑰為 Worker secret、依日期自動切換；證據自帶憑證，永遠可離線驗 | §3.6 |
| — | notary 部署在哪 | Gimmy 帳號下的 Worker + DO；不行再退 Containers → **P0 結果：Container**（Worker 連不到 Cloudflare 後面的 X） | §3.1 |
| — | 見證能不能搬到本地 | 三層見證：當面由對方手機、App 遠端自己重抓，只有網頁／離線用 notary | §3.4、D3 |
| Q2 | TLSNotary alpha 的版本相容 | 長期證據用自己的穩定 JWS；tlsn 跟季度更新一起升級，Worker 保留目前版＋前一版 | §3.7 |
| Q3 | 移除標記與舊綠勾 | 推翻 D5：標記留在 bio，30 天背景續驗，90 天沒續上降灰 | D5 |
| Q4 | 標記如何綁到 DID | bio 維持 `creds.id/@name`；名稱→npub 由第二份 zkTLS 證明，嵌入 npub 簽的 did↔npub 綁定 | §3.5 |
| Q5 | notary 隱私與濫用 | 每次請求 NIP-98（npub 簽，限已註冊名字）、白名單、不留紀錄；證據獨立發佈、續驗不重簽 Page | §3.8、§3.1 |

### 仍待確認
- 06 Q3 裁了「透明日誌」；本 plan 的撤銷清單只是 root 簽的一份清單，不是日誌，不衝突——但若之後想讓外洩可被第三方偵測，需要重開這題。
- root notary key 的保管人與備份地點（目前假設 Kidney 的 YubiKey）。
- **已知問題（P1 發現，2026-10-29，延後處理）**：onboarding Passkey「稍後再說」偶發卡在「正在設定…」（6 次 1 次）：keychain 讀完後沒寫入、CPU 閒置，卡在建立 root key 前後某個不會 resolve 的 await。疑似 dev 才有的 Metro 延遲載入 `expo-secure-store`，未證實；identity 路徑沒有逾時保護。細節見 `docs/e2e/2026-10-29-p1-maestro/result.md`。
