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
| **平台規則表** | `packages/shared/src/verify/platforms.ts` | 每個平台：URL 模板、要揭露的回應區段（meta tag／JSON path）、標記比對。純資料＋純函式。 |
| **證據驗證器** | `packages/shared/src/verify/` | App 與網頁共用、純 TS：驗證據 JWS 的 notary 金鑰鏈（root → 月度憑證 → JWS）、server 是平台網域、bio 含標記、請求路徑等於宣稱的 handle，再沿名稱證據與 npub 綁定接到 DID（§3.5）。**不需要 tlsn WASM。** |
| **notary** | Gimmy 帳號下的 Cloudflare Worker + Durable Object（每個 session 一個 DO） | Proxy 模式：WebSocket 接手機、`cloudflare:sockets` 轉發 TLS 密文、跑 verifier 的 WASM build。若 WASM verifier 編不出來或超出 128 MB／CPU 上限，退回 Cloudflare Containers，Worker 只負責轉接與簽章。與 kidney 帳號的 `solidarity-id` 是兩個獨立 Worker。 |
| **證據格式** | 我們自己的穩定 JWS（不存 TLSNotary presentation） | `{server, 請求行, bio 原文, 時間, 憑證鏈指紋, tlsnVersion, kid}`，由當月 notary 金鑰簽、附 root 簽的月度憑證。**不放進 Page**：由擁有者的 npub 獨立發佈（Nostr event，creds.id 同步收錄），以 DID 關聯；續驗只換證據、不重簽 Page。不進離線 QR。 |

### 3.2 為什麼只揭露 bio 區段
TLSNotary 對「沒揭露的部分」沒有證明成本（alpha.13 #1006），所以只對 notary 揭露 bio 那一小段：證明快、也不洩漏頁面其他內容。請求本身沒有秘密（不登入），整段揭露，讓 notary 能確認請求的是 `/@name`。notary 見證並驗過之後，把結果簽成上面的穩定 JWS；TLSNotary 只活在連線那幾秒（§8 Q2）。

### 3.3 模式：Proxy 為主，MPC 為備援
- **Proxy**（預設）：notary 代為連線、轉發密文。官方數據：5G 約 1.6 秒，頻寬需求低。風險：notary 在資料中心，IG／LinkedIn 可能擋它的 IP。
- **MPC**（備援）：手機自己連平台，不會被當成資料中心流量擋。代價：要先上傳約 30 MB 的 garbled circuit 資料，5G 約 10 秒。只在 Proxy 被擋時用，並提示用 Wi-Fi。
- 每個平台的預設模式由 spike 結果決定，寫進平台規則表。
- **注意（grill 後補）**：MPC 模式的 verifier 跑不進 Worker（約 30 MB garbled circuit 與大量運算），只能放 Containers。如果 notary 最後只有 Worker，被擋的平台（可能是 IG、LinkedIn）就沒有 notary 證據這一層：網頁訪客看到「請在 App 裡查看驗證」，App 遠端與當面兩層照常運作。要不要為此加開 Container，看 P0 ③ 實測哪些平台被擋再決定。

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
- **兩層**：root notary key 離線保存（Kidney 的 YubiKey + 紙本備份），從不上 Cloudflare，公鑰寫死在 `packages/shared`。每年一次離線作業產生 12 把月度簽章金鑰，root 為每把簽 `{kid, pubkey, notBefore, notAfter}` 憑證，上傳成 Worker secret；Worker cron 依日期切換當月金鑰。輪替不需要發 App。
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
| X | `x.com/<name>` | `<meta name="description">` | 177 KB | 中（t.co 改寫待確認） |
| GitHub | `github.com/<name>`（或 `api.github.com/users/<name>`） | bio／blog 欄位 | 待測 | 低 |
| 網站 | `https://<domain>/` | 頁面裡的標記連結 | 依網站 | 低 |
| Threads | `threads.com/@<name>` | `og:description` | 614 KB | 中 |
| LinkedIn | `linkedin.com/in/<name>` | `description`（headline + About） | 681 KB | 高（登入牆、擋 IP） |
| IG | `instagram.com/<name>/` | 內嵌 JSON | 693 KB | 高（擋 IP、JSON 改版） |
| YouTube | 頻道頁 | 不在 meta，藏在約 1.3 MB 的頁面資料 | 1.3 MB | 最後做 |

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
- **刪除**：
  - 功能已刪或本 plan 要棄用的：`sakuraBlob`×2、`groupE2E`／`groupStore`／`groupRecovery`、`leaveCardInbox`、`shamir`、`cloudSyncEngine`／`cloudSyncModel`、`ethereumRpc`、`oidcParse`／`oidcRequestQr`；chunk QR 棄用時一起刪 `qrChunking`／`qrCompression`／`qrEnvelopeWire`／`solidarityQrPayload`／`crd1Envelope`。
  - 只測 zustand store 黏合層的：`profileStore`、`pageDesignStore`、`sharingSettingsStore`、`issuerStore` 等。
  - 讀原始碼文字來斷言的：`routeActionIntegrity`、`iosBuildEnv` 等。
- **新增**：
  - 證據驗證器用 `tdd`（解析＋密碼學邊界）：偽造 notary 簽章、月度憑證非 root 所簽、證據時間落在憑證有效期外、kid 在撤銷清單內、server 不是平台網域、bio 不含標記、請求 handle 與宣稱不符、名稱證據的 npub 與綁定 event 不符、綁定 event 的 DID 與 Page 不符（複製攻擊）——全部要拒。
  - notary Worker 的請求閘門用 `tdd`：NIP-98 簽章無效／過期／重放、npub 未註冊、host 不在白名單、非 GET 或非個人頁路徑、私有 IP——全部要拒。
  - Maestro 5 條 flow（每條 user story 一條），模擬器 dev client 跑，截圖存 `docs/e2e/`。掃 QR 用 deep link 注入；NFC 護照只能實機手測。
  - 網頁 viewer 用 Playwright 開固定測試頁，確認徽章狀態。

---

## 7. 執行階段（每階段結尾一次真實 E2E）

| 階段 | 內容 | 結束時的 E2E |
|---|---|---|
| **P0 spike**（丟棄式） | ① TLSNotary mobile prover 在 iOS 實機跑 Proxy 模式，對 X 和 Telegram 出證明；量耗時、流量。② verifier 編成 WASM 跑在 Worker + DO（128 MB、CPU 上限、`cloudflare:sockets`）；不行就試 Containers。③ 從 Cloudflare 出口連各平台會不會被擋。④ TLSNotary IO channel 能否接上 Pear（當面見證）。⑤ 用真帳號測 X 的 t.co 改寫。 | `docs/e2e/<date>-zktls-spike/result.md`：決定 Worker 或 Container、每個平台的模式與標記、當面見證是否可行 |
| **P1** 測試瘦身＋Maestro 骨架 | §6 的刪除與 Maestro 第一條 flow | Maestro 跑過「建立」flow |
| **P2** 驗證引擎 | prover Nitro 模組、shared 證據驗證器（tdd）、notary Worker（NIP-98 閘門 tdd、白名單、兩層金鑰、cron 輪替）、名稱證據、平台規則表（Telegram、X、GitHub、網站）、§2 的 UX、30 天背景續驗 | 實機：X 與 Telegram 從點擊到綠勾；網頁 viewer 看到同一個綠勾；App 遠端重抓顯示即時結果 |
| **P2.5** 當面見證 | Pear 上的 Proxy 模式 verifier（對方手機見證） | 兩支實機面對面交換，徽章顯示「剛剛由你的手機見證」 |
| **P3** 其餘平台 | Threads、LinkedIn、IG（含 MPC 備援）、YouTube | 每個平台一次實機驗證紀錄 |
| **P4** 一張卡 | §4：root 簽名、QR 兩種、刪名片 wire 與相關畫面、Pear 接手護照出示 | Maestro「出示」「收人」flow |
| **P5** ZK 隱性化與砍併 | §5 與 Settings 收斂 | Maestro 全 5 條 + 護照實機手測 |

每階段結束跑一次 `bun run typecheck && bun run lint && bun run test`。安全路徑（identity、passport、attest 模組）照規則是 L，階段結束做 `/code-review`。

---

## 8. grill 決議（2026-10-29）

| # | 問題 | 決議 | 細節 |
|---|---|---|---|
| Q1 | notary 金鑰放哪、怎麼輪替、舊證據能不能驗 | 兩層金鑰：root 離線（YubiKey），月度金鑰為 Worker secret、cron 輪替；證據自帶憑證，永遠可離線驗 | §3.6 |
| — | notary 部署在哪 | Gimmy 帳號下的 Worker + DO；不行再退 Containers | §3.1 |
| — | 見證能不能搬到本地 | 三層見證：當面由對方手機、App 遠端自己重抓，只有網頁／離線用 notary | §3.4、D3 |
| Q2 | TLSNotary alpha 的版本相容 | 長期證據用自己的穩定 JWS；tlsn 跟季度更新一起升級，Worker 保留目前版＋前一版 | §3.7 |
| Q3 | 移除標記與舊綠勾 | 推翻 D5：標記留在 bio，30 天背景續驗，90 天沒續上降灰 | D5 |
| Q4 | 標記如何綁到 DID | bio 維持 `creds.id/@name`；名稱→npub 由第二份 zkTLS 證明，嵌入 npub 簽的 did↔npub 綁定 | §3.5 |
| Q5 | notary 隱私與濫用 | 每次請求 NIP-98（npub 簽，限已註冊名字）、白名單、不留紀錄；證據獨立發佈、續驗不重簽 Page | §3.8、§3.1 |

### 仍待確認
- 06 Q3 裁了「透明日誌」；本 plan 的撤銷清單只是 root 簽的一份清單，不是日誌，不衝突——但若之後想讓外洩可被第三方偵測，需要重開這題。
- root notary key 的保管人與備份地點（目前假設 Kidney 的 YubiKey）。
