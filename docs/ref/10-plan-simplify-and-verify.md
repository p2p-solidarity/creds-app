# 10 — 精簡與社群驗證（zkTLS）plan

> 2026-10-29 · 狀態（2026-10-30 更新）：**社群驗證以 §3.11 為準**（裝置證明＋p2p 見證，phase 1–7 程式完成、實機未驗）；zkTLS／TLSNotary／notary 證據（D1–D5、D8、§2 的 notary 部分、§3.1–§3.10、§8 Q1/Q2/Q5）已退役，只留作歷史。**§4（P4 一張卡）與 §5（P5 隱性化）尚未動 code**，由 UI rebrand 工作接手。
> 本文件是 06 之後的批次 plan：把 App 收斂成 5 條 user story，並把「社群驗證」做成差異化核心。
> 與 06 的關係：06 的 Q1（Pear 留）、Q3（不做透明日誌）、Q5（NIP-44 延後）不變；**Q2（card-key↔root 長效綁定）作廢**（名片改由 root 簽，見 §4）；Q6（憑證皮夾留在二層）不變，但不進主線 story。

---

## 0. 決策帳

| # | 決策 | 理由 |
|---|---|---|
| D2 | **一條驗證引擎吃所有平台**：「公開頁 `https://<platform>/<handle>` 的回應裡含有我的標記」。各平台只差一條抽取規則（bio 在哪個欄位）。 | 一套 UX、一套程式碼。2026-10-29 實測：X、Threads、LinkedIn、IG、Telegram 不登入 GET 一次公開頁，原始 HTML 就有 bio。 |
| D4 | 標記用 **`creds.id/@name`**（本身就是一個有用的 bio 連結）。X 若把它改寫成 t.co，退回成 `creds:name` 這種不像網址的標記。 | 用戶最容易接受的標記就是自己的頁面連結。t.co 問題要在 spike 用真帳號確認。 |
| D5 | ~~驗完可移除標記~~ **（grill Q3 推翻）標記留在 bio，背景自動續驗**：徽章超過 30 天，擁有者 App 開啟時就用 Proxy 模式靜默重證；超過 90 天沒續上就降成灰色「曾於 YYYY-MM-DD 驗證」；續驗失敗只通知擁有者一次。 | 綠勾代表「現在」成立。標記就是用戶自己頁面的連結，留著幾乎沒成本；同時解決帳號轉手與 notary 金鑰外洩後的恢復。 |
| D6 | **PGP 不進 v1**。 | 簽 challenge 需要用戶在別的 app 操作私鑰，做不到「點擊＋確認」。之後可用 Keyoxide 式的 notation 再評估。 |
| D7 | **Bluesky、Nostr 維持現有雙向綁定**（OAuth 寫 PDS 紀錄／kind-0 `alsoKnownAs`），不改走 zkTLS。 | 已經是最強的雙向證明，而且已上線。 |
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

## 3. 社群驗證

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
- 裝置證明在這裡的用途是**提高分身的門檻**：每一則見證都要來自真手機上沒被改過的 App，不能用腳本或模擬器灌。但同一支手機可以產生很多把金鑰，所以它擋不住「一支手機開很多 npub」；不同真人的計數只靠護照 nullifier（見下）。
- 當面交換（掃 QR）是最自然的時機：兩支手機互相檢查對方的連結，各自提示「幫對方見證」，互相背書。
- **只在使用者主動按下時才發佈**（grill 決議，2026-10-30）：見證是公開的，等於公開「我認識這個人」；只瀏覽 Page、或掃了 QR 但沒按，都不發佈。
- **2.0.0 一次到位**（grill 決議，2026-10-30）：第 3 層裝置證明、第 4 層看的人自己抓、「幫他見證」與網頁上的見證顯示都在 2.0.0 上線，不先出只有 App 內檢查的版本。
- ~~**notary 整套移除**~~（2026-10-30，同日改為下一條）：2.0.0 出貨前刪掉 notary Worker／Container（停用並刪除部署）、TLSNotary prover（Rust crate、xcframework、CI 的 `zktls-v0.2.0` 固定版本）、notary 簽章證據與 t.co 跳轉；保留平台規則與 `parseXProfile`（第 3、4 層都用）。不留隱藏備援。
- **notary 改成 Pro 專屬**（Kidney，2026-10-30）：免費用戶走裝置證明＋p2p 見證；付費的 Pro 用戶可以多一位「creds.id 見證者」。費用由營收支撐，notary 不再是任何人的必經之路。notary 的見證用和 p2p 見證相同的格式（它自己的 npub 簽），只是見證者之一。機制見 grill 待決。
- **Pro notary 自己抓頁面，不用 TLSNotary**（grill 決議，2026-10-30）：notary 直接抓公開頁、用 shared 平台規則檢查、以自己的 npub 簽一則見證；每小時批次處理一次佇列。對看的人的信任與 TLSNotary 相同（都是相信 creds.id），但任何裝置都不需要 prover：TLSNotary prover（Rust crate、xcframework、`zktls-v0.2.0` 固定版本）照原計畫從 App 移除。iOS 也不允許下載原生 prover（審核規範 2.5.2），WASM 版 prover 只在之後要證明「登入後才看得到的資料」時再評估。抓頁面先試 Worker `fetch()`（2026-10-30 的探測 Worker 被權限擋下，未測）；不通就沿用 Container 出口（P0 已證實 X／Telegram／Threads／GitHub 可達），改成 basic 規格並只在批次時喚醒。
- **2.0.0 一起做 Pro 授權橋**（grill 決議，2026-10-30）：照 09-plan 的設計，`solidarity-id` Worker 向 App Store Server API／Google Play Developer API 查證購買，簽發綁定 DID 的授權 JWS；notary 只收附有效授權的批次請求，自己不連 Apple／Google。creds.id 網頁的 Pro 功能也靠這張授權防偽造。需要 Kidney 完成 09-plan 的 A11、A12、P7、P8 設定。
- **Pro notary 的頻率**（預設，2026-10-30）：Pro 用戶所有可驗證的連結都可以請 notary 見證；送出後在下一次每小時批次處理，之後每 30 天自動重驗一次。
- **電路要輕，網頁不跑電路**（Kidney，2026-10-30）：護照 nullifier 只加最小的部分（一個雜湊輸出），不增加網頁要做的事。網頁目前不驗護照 ZK（`verifyDisclosureBadge` 只顯示存在，不是 ZK 驗證），所以網頁上的「護照見證者」標示照實標成「未在網頁驗證，在 App 驗證」；網頁上的見證人數以裝置證明計，護照的不重複人數只在 App 裡算。
- **不做 zk-email**（grill 決議，2026-10-30）：DKIM 信件 ZK 證明是唯一「任何人都能驗、不需信任誰」的社群證明，但取原始信、DKIM 換鑰、每個平台的信件格式會讓複雜度不斷上升，和拿掉 notary 的理由相同。
- **護照讓 nostr 身分成為可信的真人（免 KYC）**（Kidney，2026-10-30）：護照 ZK 證明綁在持有者的 DID，Page 再宣告 npub，所以見證者的 npub 背後是一個持有有效護照的真人，而且不揭露任何護照資料。這種見證標示「已用護照驗證的見證者」，分量高於只有裝置證明的見證。Android 退回 SD-JWT（`trustLevel: 'white'`）的不算護照 ZK。現況：護照證明沒有 nullifier，同一本護照可以撐起多個 npub。
- **2.0.0 加護照 nullifier**（grill 決議，2026-10-30）：passport-noir 目前沒有任何 nullifier（`circuits/` 全部查過），要在 OpenAC v3 的 show 電路新增一個以用途為範圍的 nullifier 公開輸出，網頁才能算「N 位不同的真人見證」。連帶工作：重新產生 proving key 與 SRS（CI 的 SRS 固定版本要一起換）、護照全流程實機重驗。屬於安全路徑，L。
- **nullifier 全域一個範圍：一本護照只對應一個護照見證 npub**（grill 決議，2026-10-30）：同一個人換再多 npub，網頁都只算一位真人；他用過的見證 npub 會因此被公開連在一起（見證本來就是公開表態）。換 npub 時，新的 Page 取代舊的綁定，舊 npub 的護照標示失效。
- **晶片簽章不強制，照實揭露**（grill 決議，2026-10-30）：護照證明只檢查資料上的發證國簽章，沒用晶片私鑰（Active／Chip Authentication），所以掃過晶片的人（飯店、機場）拿到資料副本也能做出同樣的證明與 nullifier。2.0.0 不強制晶片簽章，徽章詳情照實寫出這點；冒用者頂多冒充一位護照見證者，而 nullifier 只對應一個 npub，本人發一次新的 Page 綁定就能取回。之後再評估（需先實測台灣、日本護照是否支援 AA／CA）。
- **網頁的 Android 撤銷檢查走快取轉發**（grill 決議，2026-10-30）：creds.id 加一支 Pages Function，把 Google 公開的 `android.googleapis.com/attestation/status` 原封不動轉給瀏覽器，快取一天；比對與驗證全在瀏覽器做，函式不判斷任何證明。函式掛掉時網頁顯示「暫時無法確認撤銷狀態」，其他驗證照常。
- **預設值**（提出後未被反對，2026-10-30）：見證保留 90 天，過期不計；人數以「附有效裝置證明的見證者 npub」計；**更正（2026-10-30，phase 1 實作時發現）**：一支手機可以產生無限多把通過 Apple／Google 證明的金鑰（Android RKP 憑證約一週就過期，本來就要常換鑰），所以「同一支手機只算一次」做不到，裝置證明只保證「真手機上的正版 App」，不保證「不同手機」；「不同的真人」只能靠護照 nullifier 計；擁有者 App 每 30 天在背景重抓重簽；沒有硬體 attestation 的舊 Android 只能在 App 內檢查，不能見證也不能自證。
- **待提供（非決策）**：Play Console 的 **app signing 金鑰 SHA-256**，用來釘選 Android `attestationApplicationId` 的簽章摘要（同 passkey assetlinks 的缺口）。
- **待提供（非決策）**：09-plan 授權橋的商店設定（A11 App Store Server API 金鑰、A12 伺服器通知網址、P7 Play 服務帳號、P8 即時通知 Pub/Sub），金鑰只放 Worker secret。
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

**實作狀態（2026-10-30，phase 1–7 程式完成，見 `docs/e2e/2026-10-30-local-witness/result.md`）**
- 已做：shared 驗證器（App Attest、Android Key Attestation、RSA、憑證鏈、見證格式與計數 `summarizeWitnesses`、本機抓頁 `checkSocialMarker`）；原生 `DeviceAttest`（iOS／Android）；App 自證、看的人自己抓、「幫他見證」；passport-noir 0.4.0 全域 nullifier（以 SOD 雜湊為鍵，不用 MRZ，避免從已知個資反推）、npub 綁定事件（`d = creds.passport.npub`、`n = nullifier`，新綁定取代舊的）、App 內護照見證人數；Pro 授權橋（`POST /pro/license`，換綁 30 天冷卻，授權最長 7 天）與 Pro notary（每小時批次自己抓頁，用自己的 npub 簽見證）；網頁見證顯示、Android 撤銷清單快取轉發、`/@name` 內嵌已簽 profile pointer、第一個中繼站回應後只再等 300 ms；TLSNotary prover、Container、notary 證據碼全部移除。
- grill 待決在實作時直接定案：Q1 換綁允許、30 天冷卻；Q2 授權只給 notary 與 App 用，不寫進 Page；Q3 ES256 did:key 服務金鑰，公鑰釘在 shared（`CREDS_LICENSE_ISSUERS`）；Q4 自訂網域不做。
- 2026-10-30 已上線：兩把金鑰由腳本直接灌進 Worker secret（私鑰沒人看過），公鑰釘在 shared 2.1.2（`CREDS_LICENSE_ISSUERS`、`CREDS_NOTARY_WITNESS_PUBKEYS`）；solidarity-id（含 D1 0004、`/pro/*`）、creds-notary、creds-web 已部署；passport-noir v0.4.0 由 release workflow 打包；Android mopro 已用 NDK 版 bb 重建。
- 仍待 Kidney：Play app-signing SHA-256；商店 API 設定（`ASC_P8_KEY`／`ASC_KEY_ID`／`ASC_ISSUER_ID`、`PLAY_SERVICE_ACCOUNT_JSON`，沒設定前 `/pro/license` 回 `not_configured`）；實機 E2E。

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
| Q3 | 移除標記與舊綠勾 | 推翻 D5：標記留在 bio，30 天背景續驗，90 天沒續上降灰 | D5 |

### 仍待確認
- 06 Q3 裁了「透明日誌」；本 plan 的撤銷清單只是 root 簽的一份清單，不是日誌，不衝突——但若之後想讓外洩可被第三方偵測，需要重開這題。
- **已知問題（P1 發現，2026-10-29，延後處理）**：onboarding Passkey「稍後再說」偶發卡在「正在設定…」（6 次 1 次）：keychain 讀完後沒寫入、CPU 閒置，卡在建立 root key 前後某個不會 resolve 的 await。疑似 dev 才有的 Metro 延遲載入 `expo-secure-store`，未證實；identity 路徑沒有逾時保護。細節見 `docs/e2e/2026-10-29-p1-maestro/result.md`。
