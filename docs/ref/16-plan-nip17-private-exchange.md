# 16 — 私密交換走 Nostr NIP-17 plan

> 2026-11-05 · 狀態：**Kidney 已回覆（§9）：先做護照私密出示（§11），其餘照建議**。P1 實作中。安全路徑（identity、keychain、crypto），size **L**。
> 取代 10 §9 的方向說明；Pear／bare-kit 已在 14 §8 移除。決策都是當日的建議，新事實與它衝突時提出修改即可。
> 程式碼基準：`b1e6df9e`（branch `claude/nip17-private-exchange-c25c08`）。

---

## 0. 結論

用 NIP-17（NIP-59 gift wrap＋NIP-44 加密）在兩個 creds.id 用戶之間送三種私密訊息：**私下給聯絡方式**、**請求證明**、**回覆證明**。中繼站看不到內容與寄件人，雙方不必同時在線。

盤點時發現四件事，改變了範圍（§1）：
1. **護照的 claim 現在做不成 VP**：P2 之後護照憑證的 `rawJwt` 是 JSON（`app/passport/index.tsx:374`），`classifyCredentialFormat` 判成 `zk-proof`，`presentBuilder` 的閘門會把它擋掉。Pear 時代的「請求 over 18」對護照其實從來沒走通過。現在能出示成 VP 的只有錢包裡匯入的 JWT-VC／SD-JWT。
2. **「年滿 18」已經是公開的**：護照裝置 statement（`packages/shared/src/deviceproof/passport.ts`）的 `ageOver18` 欄位每 30 天重簽、公開發佈在 Nostr。私下再送一次 over 18 不會多保密任何東西；真正私密的是姓名和國籍。
3. **VP 的持有人不是 Page 的 DID**：VP 由 SpruceID 簽章金鑰（`keychain/signingKey.ts`）簽，Page 由 root DID（`identity/rootKey.ts`）簽，兩者是不同的 did:key。昨天 `a54b6d65` 把 Pear 專用的 root→卡片金鑰綁定（`solidarity.cardKeyBinding.v1`，300 秒、帶 aud＋nonce）刪了；遠端出示要把它拿回來，否則請求者只知道「某把金鑰簽了這個 VP」，不知道是不是對方本人。
4. **預設的 Face ID 模式不會為出示提示**：預設 `redLineOnly`，`presentProof` 不在紅線裡（`keychain/sensitiveActionPolicy.ts:115`）。「送出私密資料前一定要 Face ID」需要新增一個紅線動作（§9 Q3）。

## 1. 範圍與階段

| 階段 | 內容 | 結尾 E2E |
|---|---|---|
| **P1 傳輸＋護照私密出示**（Kidney 2026-11-05 指定優先） | `packages/shared` 的 NIP-59 wrap／unwrap、訊息解析、護照出示 statement 驗證（tdd）；App 的 kind 10050、收件匣、寄件；People 個人頁「請求護照資料」→ 持有人同意 → Face ID → 裝置金鑰簽出示 statement → 加密回覆 → 請求者驗證並顯示。設計見 §11。 | iPhone 18 Pro 模擬器（A）與第二個身分輪流：A 請求 → B 同意並回覆 → A 驗過顯示。模擬器沒有 App Attest、沒有 NFC，只能跑到「開發模式護照、未經真機檢查（L1）」；L3 那一段要 TestFlight 實機 |
| **P2 私下給聯絡方式** | `contact.share`：People 個人頁「私下分享我的聯絡方式」→ 對方個人頁出現「對方私下分享」區塊。 | 同上兩個身分輪流 |
| **P3 錢包憑證的證明請求** | 從 `da96ae9c` 取回 presentBuilder 與狀態機；拿回 `a54b6d65^` 的 cardKeyBinding；JWT-VC／SD-JWT 組成 VP 回覆。 | 同上；持有人錢包先放一張測試用 SD-JWT（§8 R3） |
| **P4 網頁加入**（依 Q4） | 網頁 session 已經解鎖 npub scalar（`airmeishi-web/src/identity/session.ts`），wire 全在 shared，網頁可以當請求者或收聯絡方式。 | 網頁 ↔ App |

每階段結尾：一次真實 E2E → `bun run typecheck && bun run lint && bun run test` → `/code-review`。

## 2. Wire

### 2.1 三層（照 NIP-59／NIP-17）

```
gift wrap  kind 1059  pubkey=一次性隨機金鑰  tags=[["p", 收件人]]  created_at=過去 0–2 天隨機
  └ NIP-44(隨機金鑰 → 收件人) ─ seal  kind 13  pubkey=寄件人 npub  tags=[]  created_at=過去 0–2 天隨機  sig=寄件人
       └ NIP-44(寄件人 → 收件人) ─ rumor  kind K_CREDS（不簽）  pubkey=寄件人  created_at=真實時間
                                     tags=[["p", 收件人], ["e", 回覆的 rumor id]?]
                                     content=JSON（§2.2）
```

- rumor 用**自訂 kind**（不用 kind 14）。kind 14 會在用戶匯入同一把 nsec 的其他 Nostr 客戶端裡顯示成一串 JSON；自訂 kind 別的客戶端會忽略。rumor kind 只有雙方看得到，中繼站只看到 1059。實作時對照 NIPs README 的 kind 表挑一個沒人用的 regular kind。
- 不寄副本給自己（NIP-17 建議寄）：寄件匣存在本機；同一個身分的另一支手機收到回覆時找不到對應請求，直接忽略。

### 2.2 rumor content（`creds.dm.v1`）

所有訊息都帶 `page`：寄件人的 **public 投影 Page JWS**（root DID 簽，`alsoKnownAs` 裡有 `nostr:<npub>`）。收件人不用連網就能驗「這個 npub 是哪個 DID」。JWS 超過 24 KB 就不帶，收件人改用 `resolveProfileByNpub` 上網查。

```jsonc
// 私下給聯絡方式（P2）
{ "v": 1, "type": "contact.share", "page": "<jws>",
  "phone": "…"?, "email": "…"?, "note": "…"? }   // 至少一個；不帶 full 投影（§10 G1）
// 請求證明（P1 只有 passport.name／passport.nationality）
{ "v": 1, "type": "proof.request", "page": "<jws>",
  "claims": ["…"],          // 1–8 個，只收已知 claim type
  "purpose": "…"?,          // ≤ 140 字，同意畫面照原文顯示並標明「對方寫的」
  "nonce": "<32 bytes hex>", "exp": 1730000000 }   // exp ≤ 7 天後
// 回覆證明——rumor 帶 ["e", 請求的 rumor id]
{ "v": 1, "type": "proof.response", "page": "<jws>",
  "passport": { "statement": "…", "device": {…} | null } }   // P1，§11
// P3 再加 "vp": "<vp+jwt>", "binding": "<cardKeyBinding JWS>"
```

拒絕不回任何訊息：「不給」和「沒看到」對請求者分不出來（沿用 Pear 的政策），請求在 `exp` 後顯示「已過期，沒有回覆」，不說「被拒」。

### 2.3 中繼站

- **自己**：npub 已就緒時，發佈 kind 10050，relay 清單＝`DEFAULT_RELAYS`（damus、nos.lol、primal）。發佈前先讀現有的 10050：**拿到 EOSE 且沒有**才發；讀到了就沿用（尊重用戶在別的客戶端設的清單）；盲讀（沒有任何 EOSE）就不發，下次再試。發佈成功後在本機記下「這份 10050 是 App 發的」（事件 id）；刪帳號時（`account/nostrErasure.ts`）只有現存的 10050 就是那一份才換成空清單，別的客戶端設的不動。
- 前提：寄件人的 Page 已經發佈到 Nostr（`profile/store.ts` 發佈時才寫入 `nostr:<npub>`），收件人的已存 Page 裡也要有 `nostr:<npub>`。缺任何一邊，按鈕直接說「對方（或你）的 Page 還沒連上 Nostr」，不假裝能送。
- **寄給對方**：讀對方的 10050。有 → 只送到那些 relay（NIP-17 的 MUST）。確認沒有（有 EOSE）→ 顯示「對方的 App 還不能收私密訊息」，不送。盲讀 → 「現在連不到中繼站」，不送。
- 收：前景時訂閱自己 10050 relay 上的 `{kinds:[1059], "#p":[me], since: 上次游標 − 2 天}`（seal／wrap 的時間往前隨機最多 2 天）。沒有推播：對方要開 App 才收得到，UI 照實寫。

## 3. 收件時的檢查（依序，任何一步失敗就丟掉，不顯示、不回）

1. wrap：kind 1059、NIP-01 id 與簽章對、`p` 是我、content ≤ 上限。
2. 用我的 scalar 與 wrap.pubkey 解 NIP-44 → seal；seal 是合法事件、kind 13、`tags` 為空、id 與簽章對。
3. 用我的 scalar 與 seal.pubkey 解 NIP-44 → rumor；rumor 欄位齊全、id 等於重算值、**`rumor.pubkey == seal.pubkey`**（NIP-17 的 MUST，否則任何人都能冒充）、`p` 是我、kind 是 K_CREDS、`created_at` 不在未來 5 分鐘以後。
4. content 用 zod strict 解析成 `creds.dm.v1`；未知 type／版本丟掉。
5. **npub → DID**：`page` 驗 root DID 簽章（`verifyProfileJws`），且 `record.alsoKnownAs` 含 `nostr:<npub(seal.pubkey)>`。沒帶 `page` 就先找 People 裡已存、宣告這個 npub 的 Page，再不然 `resolveProfileByNpub`。綁不起來就丟。寄件人 DID＝我自己的 DID 也丟。
6. 重放：記住處理過的 wrap id 與 rumor id（MMKV，保留 30 天）。
7. 依 type：
   - `contact.share`：欄位長度上限（電話 32、email 254、備註 500）、至少一個欄位。
   - `proof.request`：`exp` 未過且 ≤ 7 天、claims 數量與型別。
   - `proof.response`：`e` 指向我發出、還沒過期、還沒完成的請求；寄件人 npub＝我當初寄給的那個；VP 過 `verifyVpToken({expectedAud: 我的 root DID})`（簽章、效期、持有人綁定）；`vp.nonce`＝請求的 nonce；`binding` 是寄件人 root DID（第 5 步那個）簽的，`cardDid`＝VP 持有人、`aud`＝我、`nonce`＝請求的 nonce、未過期。

錯誤一律是 tagged union（`PrivateMessageRejection`），log 只記拒絕的種類，不記 npub、DID、內容。每次同步最多解 200 個 wrap（每個 wrap 要兩次 ECDH），其餘留到下次，避免被灌爆時卡住 JS 執行緒。

## 4. 流程與畫面

**P1 私下給聯絡方式**
- 寄：People → 某人 → 「私下分享我的聯絡方式」sheet：電話、email、備註（上次送過的值預填，存本機）→ 送出前 Face ID（Q3）→ 寄出，toast「已加密寄出」。寄出失敗（沒有 quorum）照實顯示哪一步失敗，可以重試。
- 收：對方個人頁多一個「對方私下分享 · YYYY-MM-DD」區塊，跟我自己記的 `PageLocalDetails` 分開，不覆蓋。可以一鍵複製進自己的備註。對方不在我的 People：收件匣顯示「不在你的 People」，可以先存對方的 Page。

**P2 請求證明**
- 請求者：對方個人頁 → 「請求證明」→ 選 claim（只列錢包憑證能出示的型別）＋選填用途 → 寄出 → 個人頁顯示「等待回覆 · 7 天後過期」。收到並驗過 → 「<名字> 出示了：…（這支手機在 HH:MM 驗過）」。過期 → 「沒有回覆」。
- 持有人：收件匣（People 分頁頂端的一列「1 則私密請求」，點開進 `app/inbox`）→ 同意畫面：誰（第 5 步驗過的 Page 名字＋short DID；有驗過的 `name@creds.id` 就一起顯示；不在 People 就標「不在你的 People」——Page 名字是對方自己填的，任何人都能自稱「creds.id」）、要什麼、對方寫的用途 → 選要給的 claim → Face ID → 組 VP＋binding → 寄出。沒有可出示的憑證：畫面照實說「你沒有符合的憑證」，只有「關閉」。
- 固定順序沿用 `presentRelease.ts`：比對 claim → 同意 → Face ID → 組 VP → 才送。任何一步失敗都等於不回。

**誠實文案**（所有寄出畫面都有）：「內容用對方的金鑰加密，中繼站看不到內容，也看不到是誰寄的；但看得到有人在某個時間寄了一則加密訊息給對方。」不寫「完全匿名」「無法追蹤」。

## 5. 程式落點

| 位置 | 內容 |
|---|---|
| `packages/shared/src/nostr/giftWrap.ts` | `wrapRumor`／`unwrapGiftWrap`（純函式，scalar 由呼叫端傳入）＋ NIP-59 範例向量 |
| `packages/shared/src/nostr/privateMessage.ts` | `creds.dm.v1` zod schema、`parsePrivateMessage`、`bindSenderPage`（第 5 步）、kind 10050 builder／parser |
| `packages/shared/package.json` | 3.0.0 → 3.1.0（網頁 vendor） |
| `apps/expo/src/nostr/userKey.ts` | 新增 `unwrapWithUserKey(wrap)`、`wrapWithUserKey(rumor, to)`：scalar 不離開這個模組 |
| `apps/expo/src/privateExchange/` | `inbox.ts`（訂閱、游標、去重、存放）、`send.ts`（10050 查詢、寄出、quorum）、`dmRelays.ts`、`contactShare.ts`；P2 加 `presentRelease.ts`、`presentBuilder.ts`、`presentRequestState.ts`、`consent.tsx`（從 `da96ae9c` 取回改寫） |
| `apps/expo/src/oidc/presenter.ts`、`proofVerifier.ts` | P2 拿回 `a54b6d65^` 的 cardKeyBinding（簽與驗） |
| `apps/expo/src/keychain/sensitiveActionPolicy.ts` | 新紅線動作 `sendPrivate`（依 Q3） |
| `app/inbox/index.tsx`、People 個人頁 | UI |

**不拿回**：`lane`、`laneManager`、`lifecycle`、`frames`、`handshake`、`protocol`、`mutualExchange*`、`useCardExchange`、bare-kit、hyperswarm。`cardRelease.ts`／`cardRequestState.ts` 也不拿回：「交換整張卡」就是公開 Page，不需要私密通道；P1 的 `contact.share` 取代它。

## 6. tdd：解析邊界的失敗模式（先列，紅燈先行）

NIP-44 已有官方向量（`packages/shared/vectors/nip44.json`），不重做。新增：

**unwrap（NIP-59）**
1. 不是 1059／id 錯／簽章錯 → 拒
2. `p` 不是我 → 拒
3. wrap content 解不開（MAC、padding、版本）→ 拒，不 throw 到外面
4. 解出來不是 JSON／不是事件／kind 不是 13 → 拒
5. seal 簽章錯、seal `tags` 不為空 → 拒
6. seal content 解不開 → 拒
7. rumor 缺欄位、id 與重算值不同 → 拒
8. **rumor.pubkey ≠ seal.pubkey**（冒充）→ 拒
9. rumor `p` 不是我 → 拒
10. rumor `created_at` 在未來 → 拒
11. 超大 content（> 上限）在解密前就拒
12. NIP-59 官方範例（作者／收件人／一次性金鑰）解得出原文；我們 wrap 的東西別人用標準流程解得開（往返）

**訊息層**
13. 未知 `v`／`type`、多餘欄位 → 拒
14. `page` 簽章錯、`page` 沒有宣告這個 npub、`page` 是別人的有效 Page（重放別人的 JWS）→ 拒
15. 寄件人 DID＝自己 → 拒
16. 同一個 wrap／rumor 第二次 → 忽略
17. `proof.request`：exp 過期、exp 超過 7 天、claims 為空或超過 8 個、nonce 格式錯 → 拒
18. `proof.response`：`e` 不是我發的請求、請求已過期或已完成、寄件人不是當初的收件人、nonce 不符、aud 不是我、VC 綁到別的持有人、binding 由別的 root DID 簽、binding 的 cardDid ≠ VP 持有人 → 拒
19. `contact.share`：欄位超長、全部欄位都空 → 拒

UI、訂閱迴圈、寄出流程不寫單元測試，由 E2E 涵蓋。`presentRelease` 的順序測試（同意 → Face ID → 組 VP）隨檔案一起拿回並改寫。

## 7. 安全與隱私（照實寫）

- 中繼站看得到：收件人 npub、wrap 的時間（已往前隨機 0–2 天）、大小（NIP-44 padding 只粗略遮）、我從哪個 IP 收。看不到：寄件人、內容、訊息種類。
- 寄件人的 npub 只在 seal 裡，只有收件人看得到；收件人看得到寄件人的公開 Page。
- 一次性 wrap 金鑰每則訊息新產生，用完歸零；`userKey.ts` 讀出的 scalar 只在新函式內使用，用完 `fill(0)`，不回傳給呼叫端。
- 收件匣與寄件匣的寫入照 `localDataWipeBarrier` 的 epoch 規則：清除本機資料進行中，不寫回。
- 回覆 VP 的時機會讓請求者知道「對方何時開過 App」。
- 收件匣的內容存 MMKV（與 People 快照同一層保護），刪掉某人時一併刪掉他寄來的私密內容。
- 垃圾訊息：任何人都能寄 1059 給你。綁不起 DID 的直接丟；每個寄件人最多保留 20 則；收件匣總上限 200 則。
- 盲讀規則：10050 的讀取沒有 EOSE 時，不發佈自己的 10050、不寄給對方。

## 8. 風險

- **R1 中繼站不收 1059**：有些 relay 要 NIP-42 AUTH 才收或才給 1059。P1 第一步先用拋棄式 npub 實測 damus／nos.lol／primal 收發 1059；不行就換 relay 或在 App 實作 NIP-42 AUTH（多一段工作）。
- **R2 Page JWS 太大**：avatar 欄位格式自由，public 投影可能超過 24 KB；P1 實測大小，超過就走 `resolveProfileByNpub` 後備。
- **R3 P2 的測試憑證**：模擬器上需要一張能出示的 JWT-VC／SD-JWT。先查有沒有現成的 OID4VCI 測試發證者；沒有就在開發者模式用自簽憑證（只在 `developerMode`，Rule 8）。
- **R4 兩支模擬器不能同時開**：本來就是非同步，A 寄完關機、B 開機收，正好證明「不必同時在線」。
- **R5 磁碟**：目前只剩 38 GB，iOS＋Android 的 build 會吃掉約 28 GB。Android 用 dev build，build 完立刻刪 intermediates；開發期間先用一個 bun 腳本當第二個身分（同一份 shared 程式、真的 relay），最後的 E2E 才用 AVD 上的 App。
- **R6 P2 的 claim 詞彙**：請求者不知道持有人的錢包裡有哪些 claimType。P2 開始時先看 `credentials/store` 裡實際出現的 claimType，定一份請求者能選的固定清單；清單外的不做。

## 9. 給 Kidney 的產品決策（每題附建議；「照你的」＝全部採用）

**2026-11-05 Kidney：「先優先把護照 vp 實現吧，然後剩下照你的」**——Q1 改成先做護照私密出示（§11）；Q2–Q5 採用建議。

| # | 問題 | 建議 | 其他選項 |
|---|---|---|---|
| Q1 | 階段順序 | **P1 先做傳輸＋私下給聯絡方式**，模擬器上能完整證明；P2 錢包憑證的證明請求接著做；P3 護照姓名／國籍要實機，排在最後。 | 先做證明請求（但模擬器上沒有可出示的護照，只能先用錢包憑證） |
| Q2 | 私下分享時要不要也送「full 投影」（含標成「私人」的連結，root DID 簽）？ | **v1 不送**，只送電話／email／備註（由 npub 簽的 seal 認證，再經 Page 綁到 DID）。原因見 §10 G1：People 顯示時 full 永遠蓋過 public，私下收到的 full 不會自動更新，之後會一直顯示舊版。 | 送，但要先改 People 的挑選規則（新舊優先於等級），範圍變大 |
| Q3 | 送出任何私密內容前一律 Face ID？ | **要**：新增紅線動作 `sendPrivate`，每種模式（含預設 `redLineOnly`）都提示、不吃 5 分鐘寬限。理由符合紅線的「不可逆」原則：送出去的東西收不回來。顯示自己的 QR 卡仍然不提示（10-30 的決定不變）。 | 用既有的 `presentProof`（預設模式下不會提示） |
| Q4 | 網頁 v1 加入嗎？ | **不加入**，wire 全放 `packages/shared`，P4 再讓網頁當請求者／收聯絡方式，協定不用改。 | P1 就讓網頁能收聯絡方式 |
| Q5 | 「年滿 18」已在公開護照 statement 裡；私密請求要不要還提供這個 claim？ | **不提供**：請求畫面對 over 18 直接指向對方 Page 上的護照徽章；私密請求只做真正私密的東西（錢包憑證、P3 的姓名／國籍）。要不要把 `ageOver18` 從公開 statement 拿掉是另一個題目（改 shared schema，會讓既有 statement 失效），本 plan 不動。 | 照樣提供（重複，且可能讓用戶以為 over 18 是私密的） |

**我自己定、不用問的**：拒絕不回訊息；不寄副本給自己；rumor 用自訂 kind；沒有推播（要伺服器）；收件匣只收綁得起 DID 的寄件人；P1 不做已讀回條與刪除訊息。

## 10. grill 結果（2026-11-05 自我審查，已寫回上面各節）

| # | 洞 | 處理 |
|---|---|---|
| G1 | 私下送 full 投影：People 依「full > shared > public」挑要顯示哪份（`people/profileSnapshots.ts:632`），不看新舊；私下收到的 full 不會被 Nostr 訂閱更新，會永遠蓋住對方之後的公開 Page。 | v1 不送 full（Q2 建議改成「不送」）。QR 收到的 `shared` 投影其實也有同樣的問題，另案處理，不在本 plan。 |
| G2 | 寄件人或收件人的 Page 還沒發佈到 Nostr，就沒有 `nostr:<npub>` 綁定。 | §2.3 前提：按鈕照實說明，不假裝能送。 |
| G3 | 10050 由 App 發佈，刪帳號沒有收回；但 nsec 可能是匯入的，不能刪別人客戶端設的 10050。 | §2.3：本機記下自己發的事件 id，刪帳號只收回那一份。 |
| G4 | 任何人都能寄 1059 給你，每個要兩次 ECDH。 | §3：每次同步最多 200 個；§7 每人 20 則、總共 200 則。 |
| G5 | 同意畫面的名字是對方自己填的，可以自稱「creds.id」。 | §4：名字＋short DID＋驗過的 NIP-05＋「不在你的 People」。 |
| G6 | 清除本機資料與收件匣寫入的競態。 | §7：照 `localDataWipeBarrier` 的 epoch。 |
| G7 | Face ID 次數：P2 回覆要 root 簽 binding（`getRootSigner`）＋紅線提示。 | 紅線提示不開寬限；root 簽章在 `redLineOnly` 不另外提示，`everyTime` 模式會提示兩次（可接受，照模式本意）。 |
| G8 | 同一個身分在兩支手機（passkey 同步，npub 相同）：兩支都收得到回覆，只有發請求那支有寄件匣。 | 另一支找不到對應請求就忽略（§2.1）。 |
| G9 | 磁碟只剩 38 GB。 | §8 R5：開發期用 bun 腳本當第二身分，最後才 build Android。 |
| G10 | P2 請求者不知道對方有哪些 claimType。 | §8 R6：P2 開始時定固定清單。 |

## 11. 護照私密出示（P1，Kidney 指定優先）

### 11.1 為什麼不是 SD-JWT VP
護照憑證沒有任何發證者簽過的 JWT（§0 第 1 點）；L3 的信任來源是**裝置證明**（11 §6.1：「真的 creds App 在真手機上讀到通過 passive auth 的晶片」）。所以出示沿用同一個信任模型：**持有人同意後，裝置金鑰當場簽一份只含所選 claim、綁定請求者與 nonce 的 statement**。不需要 salt／digest、不用存一份簽好的憑證、不用每 30 天重簽，也不用 cardKeyBinding（持有人就是 npub，npub 經 Page 綁到 DID）。

### 11.2 statement（`creds.passport.present.v1`，`packages/shared/src/deviceproof/passportPresentation.ts`）
```jsonc
{ "v": 1, "typ": "creds.passport.present.v1",
  "holder": "npub1…",          // 持有人＝回覆的寄件人
  "aud": "npub1…",             // 請求者
  "nonce": "<64 hex>",         // 請求帶來的
  "claims": { "name": "…"?, "nationality": "JPN"? },   // 至少一個，只能是請求過的
  "chip": "passiveAuth" | "simulated" | "unverified",
  "readAt": 1730000000, "signedAt": 1730000000 }
```
回覆 payload：`{ "passport": { "statement": "<上面的 JSON 字串>", "device": DeviceProof | null } }`。裝置證明簽的就是這串 bytes（與公開 statement 相同做法）。

### 11.3 請求者的驗證（tdd）
1. statement 用 zod strict 解析；`holder`＝回覆寄件人、`aud`＝我、`nonce`＝我發出的請求的 nonce。
2. `claims` 非空、每個 key 都在請求裡、格式對（國籍 `^[A-Z]{3}$`，姓名 1–80 字）。
3. `signedAt` 在現在 ±5 分鐘內（當場簽的）、`readAt ≤ signedAt`。
4. `device`：
   - 有 → `verifyDeviceProof`（釘選 Apple／Google 根、我們的 App、正式環境）；`notary` 一律拒；驗不過**整則拒絕**，不降級。
   - 沒有 → 照樣接受，但等級是 L1。
5. 等級：裝置證明有效**且** `chip = passiveAuth` → **L3**「由 creds App 在真機上讀取一本有效護照的晶片資料」；其他一律 **L1**「未經真機檢查」（`simulated` 另外標「開發模式護照」）。永遠不把 L1 畫成 L3。

### 11.4 持有人端
- 掃描護照時（`app/passport/index.tsx`）多存一份 `passport/privateClaims.ts`（MMKV，與 `statementStore` 同層）：`{ credentialId, name?, nationality, chip, readAt }`。姓名從 DG1 第一行（第 6–44 字，`<<` 分姓與名）解析，不用 OCR 結果；模擬的晶片沒有姓名就不存姓名（Rule 8）。刪除護照時一起刪。
- 舊的護照紀錄沒有這份資料：同意畫面說「請重新掃描護照才能私下出示」，不假裝能給。
- 收到請求：只列「請求了、而且我真的有」的 claim → 同意（逐項勾選）→ Face ID（紅線 `sendPrivate`）→ `signWithDeviceKey(npub, statement)` → 寄出。裝置簽不了（模擬器、不支援的手機）時，同意畫面事先講明「對方會看到『未經真機檢查』」，由持有人決定要不要照樣送。
- 請求能選的 claim：`passport.name`、`passport.nationality`（依 Q5 不提供 over 18）。

### 11.5 失敗模式（tdd 清單，接 §6）
20. statement 不是 JSON、多欄位、版本錯 → 拒
21. holder ≠ 寄件人、aud ≠ 我、nonce ≠ 請求 → 拒
22. claims 空、含未請求的 key、國籍格式錯、姓名空白或超長 → 拒
23. signedAt 太舊或在未來、readAt > signedAt → 拒
24. device 是 notary、device 驗不過（換 bytes、換 npub）→ 拒
25. device 為 null → L1；device 有效但 chip ≠ passiveAuth → L1；device 有效且 passiveAuth → L3
26. DG1 姓名解析：標準 TD3、只有姓、名字中間有 `<`、長度不足 88、全是填充字元 → 正確或「沒有姓名」
