# 11 — 護照 ZK（passport-noir OpenAC v3）檢討 plan

> 2026-10-30 · 狀態：**plan 已定案（§0.1、§9 全部採用建議）；P0 完成（`docs/e2e/2026-10-30-passport-p0`），下一步 P1／P3**。安全路徑，size **L**。
> 與 10 的關係：取代 10 §3.11 裡關於護照的幾條（nullifier、晶片簽章不強制、網頁不驗護照 ZK）、§4 的「護照 ZK 當面出示改走 Pear」、§5。10 的其他決定不變。
> 程式碼基準：creds-app `e9c4f09c`、passport-noir `2c58ade`（v0.4.0）。

---

## 0. 結論

**現在的護照 ZK 證明不證明任何護照。** App 驗的只有 `openac_show` 一顆證明，而這顆電路只檢查「我知道某個 commitment 的開口」，不檢查任何發證國簽章。任何人用開源的 prover、自己編一組護照資料，就能做出通過 App 驗證的證明，而且每編一組就多一個不同的 nullifier。2026-10-30 已實測（§2.2）。

所以 10 §3.11 的「N 位不同的真人（護照 nullifier）」、掃描到的護照出示（年齡、國籍）、L3 護照徽章，在證明層都能被任何人無限量偽造。App 目前沒有真的接受過偽造，只是因為另一個 bug 意外擋住：App 的解析器沒處理 mopro 證明開頭的 4 bytes 公開輸入數量，所以**任何**真證明（包括真護照的）都被判成 `malformed-public-inputs`——護照出示和計數從來沒有對真證明成功過（§2.4）。只要有人修好解析器、或用別的驗證端，偽造就會通過。這正是 Kidney 說的「ZK 變成假造身分的工具」。要先止血（§7 P0），再把電路改成驗真的發證國簽章（P3）。

輕量化也有空間：SRS 可以從 128 MB 降到約 16 MB（實測，§2.3）；vk 不放 envelope 只省 17%；護照證明約 17.6 KB，壓縮後仍要 10 幀 QR，**當面出示不該走 QR**。

### 0.1 Kidney 的方向（2026-10-30 第二輪，取代 §3–§7 裡衝突的建議）

| # | 決定 | 理由（Kidney） |
|---|---|---|
| K1 | **「真人」驗證改走裝置證明**：App 用 NFC 讀晶片、原生 passive auth 通過後，用 App Attest／Android Key Attestation 的硬體金鑰簽一份 statement（JWT 式），內容是 nullifier、npub、要揭露的謂詞與日期。這是主線，不是過渡。 | 驗證真人等於處理掉 KYC；複雜的 ZK 難維護、可靠性不如單純的裝置驗證。 |
| K2 | **護照 ZK 在「真人驗證」這段 deprecated**：計數、npub 綁定、L3 徽章都不再依賴 ZK 證明。 | 同上。 |
| K3 | **passport-noir 負責任地修完**：只證明關鍵兩步——**MRZ 背書**（DSC 簽的 SOD 涵蓋 DG1）＋**裝置綁定**（讀晶片那支手機的金鑰簽 nonce）。不做 AA（先前討論過）。修完的版本要能被第三方驗證，並對 ≤ 0.4.0 發安全說明。 | 開源專案，壞掉的信任模型不能就這樣留著。 |
| K4 | **App 保留 ZK 套件**：Semaphore、zkTLS 都可以是其中一員，定位見 Q9。 | 贊助商在意 ZK；但 ZK 不再是 KYC 的信任來源。 |
| K5 | **passport-noir 做完 MRZ 背書就畢業**（Kidney 提出，建議採用，見 Q8）：0.5.0 修好、發安全說明後封存，不再加功能；App 不再內建。 | 為了一個在 App 裡信任程度與裝置證明相同的證明，塞 128 MB SRS（加上 mopro、Android NDK barretenberg、signFailed 這些維護成本），效益很差；用裝置簽章的 statement 就能做到。 |

**為什麼 ZK 在這裡效益差（第二輪評估）**：ZK 唯一勝過裝置證明的地方，是讓「不信任 Apple／Google、也不信任 App」的驗證者，只靠政府簽章就相信護照。但我們的驗證者（其他 creds 用戶與 creds.id 網頁）在第 3 層見證本來就信任 Apple／Google，護照 ZK 拿不掉這個依賴；而 nullifier 被發證國反推（G4）ZK 也解不了。ZK 真正能買到東西的地方是**匿名**——「我是已驗證真人之一，但不說是誰」——那是 Semaphore 的工作（Q9），不是解析護照的工作。

連帶結果：§3 G0 的建議改成「App 用 C（裝置證明），passport-noir 用 A 的精簡版」；G1 定案為**不做 AA**，徽章寫「持有一本有效護照的晶片資料」；G2（人臉）照建議不做；G6 自然解決（網頁本來就能驗裝置證明）。§9 的 Q1、Q2、Q5、Q6 因此不用再問。

---

## 1. 現行信任模型（照實寫）

### 1.1 三顆電路各證明什麼

| 電路 | 在哪跑 | 證明的內容 | 誰簽的 |
|---|---|---|---|
| `dsc_chain` | 註冊時，手機 | 「某 CSCA 簽了某 DSC」＋Master List Merkle＋撤銷 SMT | **CSCA 和 DSC 都是 `attestation.rs` 每次現場產生的 RSA-2048 金鑰**，簽的是 App 正規化過的版面，不是真的 ICAO 位元組 |
| `passport_adapter` | 註冊時，手機 | 「上面那把 DSC 簽了 `SHA256(dg1ₕ‖dg15ₕ)`」、DG 雜湊鏈、可選 AA、輸出 Pedersen commitment | 同上：真的 DSC 從來沒簽過這個正規化雜湊 |
| `openac_show` | 每次出示 | 重開 commitment、裝置金鑰對 nonce 簽章、年齡／國籍謂詞、scoped link tag、nullifier | **沒有任何發證者簽章** |

`attestation.rs` 開頭的註解寫得很清楚：真正的信任來自電路**外面**那幾層——手機原生的 passive auth（對內建 Master List 驗 SOD）、`sod.rs` 重驗 DG 雜湊、撤銷名單、DG15 AA。這幾層都只在**出證者自己的手機**上跑，驗證端看不到。

### 1.2 驗證端實際檢查什麼

`apps/expo/src/passport/showVerifier.ts`（App 唯一的護照驗證器），被兩個地方用：
- `npubBinding.ts`：nostr 上的護照綁定（`d = creds.passport.npub`），`countPassportHolders` 用它算「護照見證者」人數（`components/scan/WitnessSection.tsx`）。
- `scan/showPresentationHandler.ts`：掃 sqc1 護照出示後顯示年齡、國籍。

檢查項目：vk 雜湊等於釘選值、公開輸入與證明一致、`credential_type`、scope、nonce、日期。**收到的只有 `openac_show` 一顆證明**；`dsc_chain`、`passport_adapter` 的證明根本沒送出去。就算送了也沒用：它們的 CSCA 是每次自己產生的，`csca_root` 沒有釘到任何真實的根。

**已發佈版本**：sqc1 護照出示從 2026-06-12（`865ccbbc`）就在，tag `1.3.3` 裡有同一個驗證器（49 個公開輸入，沒有 nullifier；build pin 是 `null`，改用「這支手機自己註冊護照時記下的 vk」）。邏輯上，自己掃過護照的手機會接受偽造的出示；實際上 §2.4 的解析 bug 讓它對所有證明都回 `malformed-public-inputs`（1.3.3 用的 passport-noir 0.3.x 與 0.4.0 是同一版 noir-rs `v1.0.0-beta.19`；沒有用 0.3.x 實測）。npub 綁定與護照見證計數是 2026-10-30（`5ba46b12`）才加的，還沒出貨。

### 1.3 其他已知事實

- **晶片私鑰（AA／CA）**：電路支援 AA，但只支援 ECDSA P-256＋SHA-256（`require_aa` 是公開輸入）；RSA-AA、P-384 一律降成 passive。CA（Chip Authentication）完全沒做。
- **持有人**：沒有人臉比對。即使電路修好，證明的也是「持有一份有效的護照晶片資料」（有 AA 時是「晶片在場」），不是「你就是照片上的人」。
- **nullifier**：`pedersen("nulf", sod_hi, sod_lo, scope)`，scope 全域一個（`creds.passport.nullifier.v1`）；「最新的綁定勝出」。
- **Android SD-JWT 降級**：`white`；沒有 show witness，所以不會產生 npub 綁定（`noWitness`），這點正確。
- **網頁**：`verifyDisclosureBadge` 驗的是 root 簽的自我宣告，程式註解與文案都寫明「不是政府驗證、不是 ZK」——這點誠實，沒問題。
- **可靠性**：0.4.0（含 nullifier）沒有真護照實機紀錄；Android NDK 版 `.so` 只在模擬器跑過（`docs/e2e/2026-10-30-android-bb-ndk`）；過去有 signFailed／phantom key（記憶 `passport-signfailed-rootcause`，Fix D 待實機複測）。

---

## 2. 量測（2026-10-30，本機 M 系列 Mac，scratchpad 程式，沒有改任何 repo）

### 2.1 大小

| 項目 | 數值 | 來源 |
|---|---|---|
| `openac_show` 證明 | **17,636 B**（UltraHonk 16,004 B＋51 個公開輸入 × 32 B） | 實際出證 |
| `openac_show` vk | **3,680 B**，SHA-256 = `bc03240f…7218`（等於 App 的 build pin） | 實際出證 |
| deflate 後的證明 | 原大小的 54% | zlib -9 |
| show envelope（含 vk） | JSON 29,545 B → sce1 16,335 字元 → **11 幀**（每幀 1,500 B，App 的 render-safe 值） | 用真證明組 envelope |
| show envelope（不含 vk） | 24,626 B → 13,640 字元 → **10 幀** | 同上 |
| 只放證明二進位 | 12 幀（1,500 B）／7 幀（2,900 B，QR 上限） | 計算 |
| `passport.srs.bin` | 134,217,940 B（128 MiB）＝ 2²¹ 點 | 檔案 |
| 電路 dyadic 大小 | `passport_adapter` 2¹⁸、`dsc_chain` 2¹⁷、`openac_show` 2¹⁷ | `get_circuit_size` |
| 中繼站單則上限（NIP-11） | primal、damus 1,000,000 B；nos.lol 131,072 B | 2026-10-30 查詢 |

iOS release `.app` 約 280 MB、SRS 佔 46% 是盤點時的數字，本次沒有重量。

### 2.2 偽造實驗

用一把隨便的 P-256 金鑰當「裝置金鑰」、完全不存在的護照（隨便填 SOD 雜湊、出生日期、國籍），算出 commitment、link tag、nullifier，對 App 內建的 `openac_show.json`（與 test-vector 位元相同）出證：

- 兩組不同的假資料各出一顆證明，**都 `verified=true`，vk 雜湊都是 `bc03240f…7218`**；
- 兩個 nullifier 不同 → 一台電腦就能做出任意多位「不同的護照持有人」；
- nonce 用 `SHA256("creds.passport.npub:v1:" + npub)`、scope 用 App 的常數，所以能直接包成 nostr 綁定事件，通過 `verifyPassportNpubBinding`。

不需要越獄、不需要改 App、不需要讀過任何晶片。實驗程式留在本 session 的 scratchpad，**不放進 repo**（creds-app 與 passport-noir 都是公開 repo；這份 plan 只寫機制、不寫步驟）。

### 2.3 SRS 可以縮小 8 倍

`noir-rs` 的 `setup_srs_from_bytecode` 把 dyadic 大小乘上 `ULTRA_HONK_SRS_MULTIPLIER = 8`（`gen_srs.rs` 註解說這個值是「經驗值」）。直接用 `setup_srs(dyadic × m)` 測 `openac_show`：

| m | SRS 點數 | 結果 | 記憶體峰值 |
|---|---|---|---|
| 1 | 2¹⁷ | 出證＋驗證成功，vk 相同 | 329 MiB |
| 2 | 2¹⁸ | 成功，vk 相同 | 470 MiB |
| 4 | 2¹⁹ | 成功，vk 相同 | 478 MiB |
| 8（現行） | 2²⁰ | 成功 | 442–644 MiB |

照這個結果，`passport_adapter`（2¹⁸）只需要約 16.8 MB 的 SRS，`openac_show` 約 8.4 MB。`passport_adapter` 在 1× 下的出證還沒測（要真的晶片 witness，P1 補）。SRS 大小不影響安全性：KZG 的 SRS 是通用的，電路只取前 N 個點；vk 相同代表電路與承諾設定一致。

出證時間 3.5–15 秒（同一台機器上有其他 session 在編譯，數字很吵，不當基準）。

---

### 2.4 App 的解析器讀不懂真的證明（P0 時發現）

mopro／barretenberg 的證明位元組開頭有 4 bytes 的公開輸入數量（`00 00 00 33` = 51），後面才是 51 × 32 B 的公開輸入。`showVerifier.ts` 的 `extractPassportShowProofPublicInputs` 從第 0 個 byte 就開始切欄位，所以讀歪，回 `null` → `malformed-public-inputs`。單元測試的假證明沒有這個前綴，所以一直沒被抓到。原生層（`HybridPassportZk.swift`、Android `HybridPassportZk.kt`）都是原封不動轉交 mopro 的位元組。

實測（`docs/e2e/2026-10-30-passport-p0/result.md`）：偽造的證明丟進 App 自己的 TS 驗證器——原樣的位元組被判 `malformed-public-inputs`；把前綴對齊之後，P0 前的驗證器回 `ok: true`（接受偽造護照），P0 後回 `issuer-unbound`。

P2 會把整個護照 ZK 驗證器移除，所以**不修**這個解析器；P0 的 `issuer-unbound` 關卡確保就算有人修了它，偽造也過不了。

---

## 3. 缺口與選項

每個缺口列 2–3 個選項；「網頁負擔」以 Kidney 的規則為準：網頁不跑電路。

### G0 證明沒有綁到真的發證國（最嚴重，P0＋P3）

| 選項 | 做法 | 成本 | UX | 網頁負擔 |
|---|---|---|---|---|
| **A. 真鏈電路，DSC 明文**（建議） | `passport_adapter` 改成吃真的 SOD：驗 CMS SignedAttributes 的 DSC 簽章、`messageDigest` = H(eContent)、DG1 雜湊在 LDSSecurityObject 裡。DSC 憑證明文放進證明包，驗證端用純 TS 對內建 Master List 驗 CSCA → DSC 與撤銷。刪 `dsc_chain` 與 `attestation.rs`。綁定事件改成 prepare 證明＋show 證明＋DSC 憑證（約 50 KB，壓縮後約 27 KB，在三個中繼站上限內）。 | 高：每種 DSC 演算法（RSA-2048/3072/4096、PSS、ECDSA P-256/384）要一個電路變體；先只做台灣、日本實際用到的（P1 量）。passport-noir 0.5.0、新 vk pin。 | 不變（掃一次、背景出證）。註冊從 3 顆證明變 1 顆。 | 網頁可以用 TS 驗 DSC 那層（顯示「發證國：TWN，DSC 有效」）；ZK 本身仍只在 App 驗 |
| B. 真鏈電路，DSC 在電路裡 | 同 A，但 CSCA → DSC 也在電路內（`dsc_chain` 改吃真的 TBS），DSC 不公開。 | 最高：CSCA 是 RSA-4096／PSS／P-384，電路很大，SRS 至少再大一倍。 | 註冊多一顆大證明，舊手機更慢 | 網頁什麼都驗不了 |
| C. 只靠裝置證明 | App 在 passive auth 通過後，用 App Attest／Key Attestation 的硬體金鑰簽 `{nullifier, npub, aa, 日期}`。 | 低：shared 驗證器和原生 `DeviceAttest` 已有（10 §3.11）。 | 不變 | 網頁可完整驗（純 TS，已有） |

A 和 B 的差別只在「DSC 要不要公開」：公開會洩漏發證國（本來多半就揭露）和大約哪一季核發的（同一把 DSC 通常簽約三個月的護照；台灣 2024 年核發 286 萬本，一季約 70 萬本）。

**建議**：2.0.0 用 C 當過渡（信任「真機上的正版 App 讀過有效晶片」，與 10 §3.11 第 3 層同級，文案照實寫）；2.1 做 A，讓 ZK 成為「不必信任 Apple／Google／我們」的那一層。這也是對贊助商最誠實的說法：ZK 的價值是取代對裝置的信任，而現在它什麼都沒取代。

### G1 讀過晶片的人能複製證明（AA／CA）

| 選項 | 做法 | 成本 | UX | 網頁負擔 |
|---|---|---|---|---|
| **A. 有 AA 就用、分兩級**（建議） | 日本等支援 ECDSA AA 的護照走 `require_aa = true`，標「晶片在場」；台灣現行護照沒有 AA（§5），標「有效晶片資料」。AA 若是 P-384，要補 P-384 驗章（Noir 沒有 P-384 blackbox，要用 bignum，成本高，P1 先確認曲線）。 | 中 | 不變（AA 在 NFC 讀取時一起做） | 無（級別寫在公開輸入） |
| B. 強制 AA | 沒有 AA 的護照不給徽章。 | 低 | 台灣用戶全部拿不到，等於砍掉主要市場好幾年（10 年效期） | 無 |
| C. 加做 CA（EAC） | DG14 的 Chip Authentication。 | 高 | — | — |

CA 在日本外務省的護照晶片保護剖繪裡沒有出現（只有 BAC＋PACE＋AA），台灣也沒有公開資料，所以 C 不值得做。

### G2 證明的是「持有資料」，不是「本人」

| 選項 | 做法 | 成本 | UX |
|---|---|---|---|
| **A. 不做人臉，文案照實寫**（建議） | 徽章寫「持有一本有效護照的晶片」，有 AA 寫「晶片在場」。 | 無 | 無 |
| B. 手機上比對 DG2 照片與自拍 | 內建人臉模型＋活體偵測。 | 高：模型 5–20 MB、可被翻拍攻擊、比對無法放進電路（只能靠裝置證明背書）、要處理 DG2 照片的隱私 | 多一步自拍 |
| C. 之後再評估 | 等 P3 上線、有真實濫用再說。 | 無 | 無 |

### G3 nullifier 可被搶綁

現行「最新的綁定勝出」：任何能做出同一 nullifier 的人（修好 G0 之後＝讀過晶片的人）都能隨時搶走，雙方可以無限互搶。

| 選項 | 規則 | 優點 | 缺點 |
|---|---|---|---|
| **A. 認「持有人」不認 npub：先註冊者勝、AA 可搶回**（建議） | 「持有人」＝ prepare commitment C（P3；C 綁了註冊那支手機的裝置金鑰與只存在本機的 `link_rand`，別人重算不出同一個 C 的 show 證明）；P2 過渡期用裝置證明的金鑰代替 C。同一 nullifier：有 AA 的勝過沒有 AA 的；同級時**最早出現且仍有效的持有人**勝出；同一持有人換 npub 立即生效；持有人 90 天沒重發就失效，之後才輪到別人。 | 換 npub 不用等；搶綁者要搶在本人之前，本人持續使用就搶不走；日本用戶可用 AA 取回。 | 換手機（新的裝置金鑰＝新持有人）時，沒有 AA 的人要等舊持有人過期（最多 90 天）；若被人先註冊，沒有 AA 的本人無法取回。 |
| B. 維持最新勝出 | — | 最簡單 | 互搶無解 |
| C. 只認裝置證明的金鑰 | 同 A，但連 P3 之後都用裝置金鑰當持有人。 | — | 一支手機能產生無限把通過證明的金鑰（10 §3.11 更正），對搶綁沒有額外幫助，還把 P3 綁回 Apple／Google |

重發要用裝置金鑰簽章（`signOpenAcDeviceBindingDigest` 走 Face ID 閘門），所以「每 30 天重發」不能真的在背景做：改成 App 開啟時、綁定超過 30 天就重發（落在 Face ID 寬限期內就不會多跳一次）。90 天的失效期因此是「三個月沒開過 App」。

### G4 nullifier 讓「讀得到晶片資料的人」認得出你的 npub

nullifier 只由 SOD 雜湊決定。發證國政府、讀過你晶片的海關或任何拿到晶片資料的人，都能算出你的 nullifier，再去 nostr 找到對應的 npub。只要 nullifier 是「每本護照一個固定值」，這就無法避免（要不可預測，得用只有晶片知道的秘密；ECDSA-AA 是隨機簽章，不能當秘密；台灣沒有 AA）。

| 選項 | 做法 | 影響 |
|---|---|---|
| **A. 徽章與計數分開，計數 opt-in**（建議） | L3 徽章用 `nullifier_scope = 0`（電路已支援，輸出固定為 0），發證國也連不起來；「成為護照見證者」另外開，開之前明講「發證國與讀過你晶片的人可以認出這個 npub」。 | 預設最安全；計數人數會變少 |
| B. 維持現狀並揭露 | 所有護照綁定都帶 nullifier，徽章詳情寫明。 | 計數最多；對社運／記者用戶風險高 |
| C. 不做計數 | 拿掉 nullifier。 | 失去「不同真人」計數（10 §3.11 的核心） |

### G5 Android SD-JWT 降級

已經正確（`white`、不產生綁定）。NDK 版 barretenberg 修好後，降級只會在 prover 載入失敗時發生。**不改**，只在 P3 的驗證器測試裡加一條：`white` 憑證不能產生綁定、不能被計數。

### G6 網頁不驗護照 ZK

| 選項 | 做法 | 網頁負擔 |
|---|---|---|
| **A. 網頁驗裝置證明那層＋（P3 後）DSC 那層**（建議） | 過渡期的裝置證明綁定、P3 的 DSC 憑證都是純 TS，網頁已經有驗證器。ZK 本身標「在 App 驗證」。 | 無電路 |
| B. 網頁載入 bb.js 只驗不證 | 點開時才下載 WASM。 | 多 MB 級 WASM，違反「網頁不跑電路」的精神 |
| C. 網頁什麼都不驗 | 只顯示「在 App 驗證」。 | 無 |

### G7 可靠性

不是選項題，是每階段的實機門檻：台灣、日本真護照 × iPhone（含 A12 XR）＋Android 實機；記錄出證時間、記憶體峰值、AA 成功率；signFailed Fix D 一起複測。

---

## 4. 輕量化

> 依 §0.1（K2、K5），App 不再內建護照 prover，App 端的 SRS、vk、envelope、QR 問題整個消失。本節的 SRS 縮小、vk 釘選只適用於 passport-noir 0.5.0 函式庫本身。

| 項目 | 現況 | 建議 | 效果 |
|---|---|---|---|
| SRS 乘數 | 8×，128 MiB 內建 | 改 1×（P1 先確認 `passport_adapter` 在 1× 能出證；P3 的新電路照實際 dyadic 算） | 128 → 約 17 MB；記憶體峰值也降（A12 受惠） |
| SRS 按需下載 | 沒有 | **先不做**。縮到 17 MB 後，內建比下載少一個失敗點。若 P3 的電路讓 SRS 再變大，再用 Apple Background Assets／Play Asset Delivery 在第一次掃護照時下載，下載後先比 SHA-256 再用。 | — |
| iOS 2.5.2 | — | 條文禁止下載「會新增或改變功能的程式碼」。SRS 是曲線點（資料），可以下載；電路 JSON 是 ACIR bytecode（被 prover 解讀執行），算程式碼，**一律內建**，不可遠端更新。 | — |
| vk 放 envelope | `vkB64` 3,680 B | vk 內建（雜湊已經釘了），envelope 不帶；envelope 裡重複的 `publicInputs` 也拿掉（證明裡本來就有）。schema 升 v2，舊 App 讀 v1 一個版本。 | 每則綁定少約 4.3 KB（−17%） |
| 當面出示 | sqc1 多幀 QR，10–11 幀 | **刪除**（ui-rebrand 的 P4 正在刪 Present「證明」分頁與 sqc1）。當面時對方掃 Page QR，在 App 裡查 nostr 上的綁定並驗證；離線時用 Pear。護照證明永遠不進 QR。 | 少一條傳輸與 UI |
| 一幀 QR 的可能 | — | 只有換成 Groth16（約 256 B）才做得到，但要每顆電路一次 trusted setup，違背 OpenAC 的透明設定，也不輕。**不做**。 | — |
| 電路數 | 3 顆（`dsc_chain`、`passport_adapter`、`openac_show`） | P3 後 2 顆（`passport_adapter` 真鏈＋`openac_show`），DSC 改在 TS 驗 | 註冊少一顆證明、少一個 vk |

### 保留的 OpenAC 核心特性（贊助商在意的）
- **選擇性揭露／謂詞**：年齡 ≥ N、國籍，維持在 `openac_show`。
- **兩階段 prepare／show 與 Pedersen commitment**：維持；prepare 改成真鏈後，這個架構才第一次有意義。
- **裝置綁定（不可轉移）**：維持 show 裡的 P-256 裝置簽章。
- **scoped 連結性**：維持 `link_scope`；新增「徽章用 scope 0 的 nullifier」（G4）。
- **不需要發證國配合**：維持，直接用 ICAO 9303 的晶片資料。
- 照實寫的偏離：後端是 UltraHonk＋通用 SRS（不是論文的 Spartan＋Hyrax 透明設定），passport-noir `openAC.md` D3 已記載。

---

## 5. 台灣、日本護照的 AA／CA 支援度

| 國家 | AA | CA | CSCA（內建 Master List） | 來源 |
|---|---|---|---|---|
| 日本 | **有**。外務省領事局旅券課委託 JBMIA 的護照 IC 保護剖繪（2016-03-08，JISEC C0500）要求 BAC＋PACE v2＋AA，AA 為 ECDSA 256 或 384 位元，搭配 SHA-256／SHA-384。 | 剖繪中沒有 | RSA-4096（RSASSA-PSS）；較新的一張是 EC P-384（ecdsa-with-SHA384），效期到 2035 | [JISEC C0500 英譯本](https://www.commoncriteriaportal.org/nfs/ccpfiles/files/ppfiles/c0500_epp.pdf)；`nitro-modules/attest/android/src/main/assets/masterList.pem` |
| 台灣 | **現行護照沒有**。外交部 115 年度預算：領事事務局「較上年度增列建置晶片護照系統主動認證安全機制及製發系統升級等經費」；立法院公報 115 年第 51 期提到主動認證「已於 115 年 3 月簽約得標廠商」（只讀到搜尋摘要，全文 PDF 抓不下來）。 | 無公開資料 | RSA-4096（sha256WithRSAEncryption），多代並存，最新效期到 2037 | [外交部 115 年度主管預算](https://ws.mofa.gov.tw/Download.ashx?u=LzAwMS9VcGxvYWQvNDAyL3JlbGZpbGUvMTk4NS8xMjA1NjIvN2JlZTQ3OWYtYThhOS00Yzg4LWFiYjUtNDgxYzNkOTVlNzkwLnBkZg%3D%3D&n=MTE15bm05aSW5Lqk6YOo5Li7566h6aCQ566X5qGILnBkZg%3D%3D) p.42；`masterList.pem` |

**要實機確認的（P1，不記任何個資）**：日本 AA 是 P-256 還是 P-384；台灣、日本 DSC 簽 SOD 的演算法與金鑰長度、LDS 雜湊演算法；台灣新版（有 AA 的）護照什麼時候開始核發。電路要支援哪些變體，完全由這張表決定。

---

## 6. 目標架構（依 §0.1）

兩條線分開：App 的「真人」驗證不再經過 ZK；passport-noir 修成一個自己站得住的開源函式庫。

### 6.1 App：護照裝置證明（K1）

```
註冊（每本護照一次）
  NFC：BAC/PACE → DG1、SOD（含 DSC 憑證）
  原生 passive auth：DSC → 內建 Master List 的 CSCA、撤銷、DG1 雜湊（現有程式）
  算出要揭露的謂詞（例如年滿 18、國籍），算 nullifier（依 Q3）
  裝置金鑰（10 §3.11 的同一把 App Attest／Key Attestation 金鑰）簽 statement：
    { type: creds.passport.v1, npub, nullifier?, claims, cscaCountry, passportExpiry, iat }
  外層用 npub 簽 nostr 事件（沿用 witness 的「statement＋device」格式）

重發：App 在背景每 30 天重簽一次（App Attest assertion 與 Android 硬體金鑰都不需要 Face ID）

驗證（App 與網頁同一套 shared 純 TS，不跑電路）
  裝置證明鏈 → 釘選的 Apple／Google 根、我們的 App、正式環境
  statement 的 npub = 事件作者 = Page 宣告的 npub；未過期
  計數：依 G3 規則挑出每個 nullifier 的有效持有人
```

- 信任模型與 10 §3.11 第 3 層相同：「Apple／Google＋這支手機沒被越獄」。徽章寫「由 creds App 在真機上讀取一本有效護照的晶片資料」。
- 不再需要：SRS、電路、mopro prover、show witness、show envelope、sqc1、vk pin、SD-JWT `white` 降級（依 Q8）。
- 事件大小：App Attest 的 attestation 物件約數 KB，遠低於中繼站上限；沒有 QR 問題。

### 6.2 passport-noir 0.5.0：MRZ 背書＋裝置綁定（K3）

一顆電路取代現在的三顆（依 Q10）：

```
私密輸入：DG1、LDSSecurityObject（eContent）、SignedAttributes、DSC 對 SignedAttributes 的簽章、裝置公鑰、裝置簽章
公開輸入：DSC 公鑰的雜湊、nonce、scope、今天日期、要揭露的謂詞與結果、scoped 裝置標記、可選 nullifier
電路檢查：
  1. DSC 簽章驗過 SignedAttributes（只做 P1 量到的台灣、日本演算法）
  2. SignedAttributes 的 messageDigest = H(eContent)
  3. eContent 裡 DG1 的雜湊 = H(DG1)            ← 以上三步就是「MRZ 背書」
  4. 裝置金鑰簽了 nonce；scoped 裝置標記 = H(裝置公鑰, scope)   ← 裝置綁定
  5. 謂詞（年齡、國籍）只從 DG1 取值
驗證端（Rust／TS，不在電路裡）：DSC 憑證 → 釘選的 CSCA 清單、撤銷、效期 → DSC 公鑰雜湊 = 公開輸入
```

- 刪：`dsc_chain`、`attestation.rs`（自己產生的 CSCA／DSC）、AA、Pedersen 兩階段 commitment。
- scoped 裝置標記代替 OpenAC 的 commitment 連結：同一 scope 內是固定化名，不同 scope 連不起來；沒有裝置私鑰就做不出同一個標記（不可轉移）。
- 測試：單元測試用合成的 CSCA／DSC，但驗證端**一定**要釘選信任清單（測試時清單只有測試 CSCA）；真護照只在本機 E2E，不把真晶片資料放進 repo。
- 安全說明：README 與 GitHub Security Advisory 寫明 ≤ 0.4.0 的證明沒有綁到發證國，不能拿來證明護照有效。

### 6.3 與其他 session 接軌
- UI rebrand session（P4／P5）：刪 Present「證明」分頁與 sqc1，與本 plan 一致；`scan/showPresentationHandler.ts` 的護照分支 P0 先改成不給綠勾，之後跟 sqc1 一起刪。
- Nostr 漸進載入 session：護照 statement 用 `witness/witness.ts` 的 `fetchEvents`，不碰 `src/nostr` 的載入順序。
- 10 §3.11：網頁與 App 的「N 位護照見證者」改用 §6.1 的 statement 計數；「電路要輕，網頁不跑電路」自然成立。

---

## 7. 階段（每階段結尾一次真實 E2E，結束跑 `bun run typecheck && bun run lint && bun run test`，安全路徑做 `/code-review`）

| 階段 | 內容 | 結束時的 E2E |
|---|---|---|
| **P0 止血**（2.0.0 出貨前，✅ 2026-10-30） | `countPassportHolders` 不再計數；`showPresentationHandler` 的護照分支改成「此版本的護照證明不含發證國驗證」，不給綠勾；`publishPassportNpubBinding` 停止發佈；所有 v1 綁定一律不算。**回歸測試**（真 bug）：用任意 opening 產生的 show 證明不能被當成護照。 | 模擬器：掃假護照出示 → 不給綠勾；見證區不出現護照人數（截圖） |
| **P1 護照裝置證明**（App 主線） | §6.1：shared 新增 `creds.passport.v1` statement 的驗證（tdd：偽造裝置證明、npub 不符、過期護照、開發環境 aaguid、`white` 憑證、G3 持有人規則、Q3 的 nullifier 選項）；App 在 passive auth 後簽發與背景重簽；`WitnessSection` 與網頁改用它計數。 | 兩支實機（TestFlight build，dev build 的 App Attest 是 sandbox）各掃一本護照 → 對方 App 與 creds.id 網頁都看到「護照見證者」 |
| **P2 App 移除護照 ZK**（依 Q8） | 拿掉 mopro 護照 prover、`passport.srs.bin`、三顆電路、`showWitnessVault`、show envelope、sqc1 護照路徑、SD-JWT 降級；CI 的 SRS／xcframework pin 與 Android NDK barretenberg 建置一起移除；Semaphore 不動。已存的舊護照憑證（`passport-openac-v3`、`sd-jwt-fallback`）不再顯示 L3 徽章，改顯示「請重新掃描護照」並走 P1 的流程（Rule 8：不留一個看起來有效的舊徽章）。 | release build 的 `.app`／AAB 大小前後對照；實機掃護照到徽章完整走一次 |
| **P3 passport-noir 0.5.0** | 晶片調查（台灣、日本真護照：SOD／DSC 演算法、LDS 雜湊，只記 OID 不記個資）→ §6.2 的電路與驗證端；只支援調查到的演算法，其他一律失敗並寫明；SRS 照實際 dyadic 大小（不乘 8）；發安全說明；**完成後封存 repo（畢業）**，README 寫明狀態並指向 creds 的裝置證明做法。 | 真護照 → 證明 → 獨立的驗證 CLI 驗過；換成任意 opening／非釘選 CSCA → 被拒（回歸） |
| **P4 ZK 套件**（依 Q9） | 依 Q9 的定位另開 plan。 | — |

P1 與 P3 互不依賴，可以平行；P2 要等 P1 上線（App 才有新的護照徽章）。

---

## 8. grill 結果（自我審查，已解決的不需要 Kidney 決定）

第一輪的條目以「App 繼續用 ZK、P3 做兩階段真鏈電路」為前提，留著當紀錄；被 §0.1 取代的部分以最後的「第二輪」條目為準。

- **偽造要不要越獄或改 App？** 不用。任何一台電腦跑開源 prover 就行（§2.2）。所以 P0 不能等。
- **把 prepare 證明一起送出就修好了嗎？** 沒有。prepare 的 CSCA／DSC 是每次現場產生的，`csca_root` 沒釘；照樣能偽造。
- **那釘住 `csca_root` 呢？** 現行電路驗的是 App 正規化過的版面，真的 CSCA／DSC 從來沒簽過，釘了之後沒有任何真護照能通過。只能改電路吃真的 ICAO 位元組（P3）。
- **P2 的裝置證明擋得住什麼？** 擋得住「沒讀過晶片的電腦」；擋不住越獄手機配合攔截工具，也擋不住讀過晶片的人用正版 App 重做（G1、G3 處理）。和 10 §3.11 第 3 層同級，文案照寫。
- **1× SRS 會不會不安全？** 不會。SRS 大小只決定能不能出證，不影響 soundness；實測 vk 相同。
- **下載 SRS 會不會被 2.5.2 退件？** SRS 是資料，不是程式。電路 JSON 是 bytecode，一律內建。縮到 17 MB 後先不下載。
- **拿掉 envelope 的 vk，舊 App 怎麼辦？** schema v2；新 App 讀 v1 一個版本，舊 App 看不懂 v2 就顯示無法驗證（不會誤判成通過）。
- **QR 能不能做到一幀？** UltraHonk 證明約 16 KB 固定，最少 7 幀；Groth16 要 trusted setup，不做。
- **DSC 明文會不會破壞 OpenAC 的不可連結性？** 同一把 DSC 簽了數十萬本護照，連結不到個人；洩漏的是國籍與大約的核發季（Q2）。prepare commitment 在同一 scope 內本來就是固定的化名（設計如此）。
- **nullifier 能不能做到發證國也算不出來？** 不能（G4）；所以預設不帶 nullifier（Q3）。
- **台灣沒有 AA，G3 的「AA 可搶回」對台灣用戶沒用？** 對。台灣用戶只有「先綁先贏＋90 天失效」的保護；徽章詳情要寫。台灣新版護照有 AA 後自動升級。
- **裝置綁定的金鑰沒有被 App Attest 證明，有關係嗎？** 裝置綁定只保證「出示者持有同一把私鑰」（不可轉移），不是護照真偽的來源；P3 後護照真偽由電路保證，這把鑰匙不需要額外證明。
- **Pear 當面出示還需要嗎？** 平常不需要：對方掃 Page QR 後在 App 裡查 nostr 上的綁定就夠。Pear 只在雙方都離線時用，走同一個 v2 事件格式。
- **已發佈的 1.3.3 受不受影響？** 邏輯上受影響（自己註冊過護照的手機），實際上被 §2.4 的解析 bug 擋住：偽造的和真的出示都被拒絕。所以 Q7 不另出 hotfix 更站得住。
- **「每 30 天背景重發」做得到嗎？** 做不到：show 證明要裝置金鑰簽章，走 Face ID 閘門。改成 App 開啟時重發（G3）。
- **「先綁先贏＋90 天失效」會不會讓搶綁者撿走過期的綁定？** 會，如果只認 npub。所以改成認持有人（prepare commitment C）：同一持有人換 npub 不受影響，只有三個月沒開 App 才會讓出。
- **別人能不能拿我公開的 prepare 證明去做 show？** 不能：show 要開 C，需要只存在我手機的 `link_rand` 與裝置私鑰。AA 簽章是私密 witness，不會公開；P3 再把 AA challenge 綁到裝置公鑰。
- **10 §3.11 寫「晶片簽章不強制、冒用者頂多冒充一位」**：前提是證明綁到真護照；現況下冒用者可以冒充無限位，前提不成立，所以那條決議要重開（Q4）。

- **（第二輪）裝置證明當主線，擋不住什麼？** 越獄手機配合攔截工具可以偽造 passive auth 的結果；讀過晶片資料的人用正版 App 也能簽出同一個 nullifier（G3 處理）。這是 Kidney 接受的取捨：比 ZK 好維護、可靠，且網頁能驗。
- **背景重簽要不要 Face ID？** 不用：`DeviceAttest` 的 `sign` 是 App Attest assertion（iOS）與不需使用者驗證的硬體金鑰（Android），沒有生物辨識閘門。所以 §6.1 能真的在背景每 30 天重簽；G3 的「三個月沒開 App」改成「三個月沒有重簽」。
- **G3 的「持有人」在 P1 是什麼？** 簽 statement 的那把裝置金鑰。一支手機能產生無限把金鑰，但每把都要先讀到一本通過 passive auth 的護照；先註冊者勝，所以多產生金鑰搶不走別人的 nullifier。
- **passport-noir 只做單顆電路，裝置綁定還成立嗎？** 成立，但要有公開的 scoped 裝置標記；只在電路裡驗「某把金鑰簽了 nonce」而不公開任何東西，等於沒有綁定（任何金鑰都行）。OpenAC 用兩階段 commitment 解這件事，我們用 scoped 標記解，換來少一顆電路。
- **單顆電路每次出示都要重驗 RSA，會不會太慢？** App 已經不跑它（K2），只影響函式庫的使用者；以 `passport_adapter` 2¹⁸ 的量級估，手機上十幾秒，函式庫可以接受。
- **App 移除 ZK 後，舊用戶的護照憑證怎麼辦？** 舊憑證的證明本來就沒綁發證國，不能沿用；P2 讓它們顯示「請重新掃描護照」，重掃後產生 P1 的 statement。
- **passport-noir 畢業前一定要做 0.5.0 嗎？** 不一定：最省的負責做法是只發安全說明並封存。建議還是做 0.5.0（Q8），因為範圍已縮到 MRZ 背書＋裝置綁定，而且「驗證端必須釘選信任清單」這一步本身就是值得留下的修正。
- **passport-noir 的測試向量能不能用真護照？** 不能，真晶片資料是個資。單元測試用合成 CSCA／DSC，但驗證端必須釘選信任清單，所以合成資料只在測試清單下通過——這正是 ≤ 0.4.0 缺的那一步。

---

## 9. 給 Kidney 的產品決策（每題附建議；「照你的」＝全部採用建議）

第一輪的 Q1、Q2、Q5、Q6 已由 §0.1 定案。**2026-10-30 Kidney：「照你的」——下表 Q3、Q4、Q7–Q10 全部採用建議答案，先做 P0。**

| # | 問題 | 建議答案 | 其他選項 |
|---|---|---|---|
| Q8 | passport-noir 怎麼收尾？App 還內建嗎？ | **0.5.0 做完 MRZ 背書＋安全說明後封存（畢業），App 不內建**（K5、P2、P3）：App 的護照流程只剩 NFC＋passive auth＋裝置證明，少 128 MB SRS、mopro xcframework、Android NDK barretenberg 建置。 | 只發安全說明並封存，不做 0.5.0（最省，但留下一個沒修好的開源電路）；或 App 內建 0.5.0 當進階選項（SRS 約 17 MB 起） |
| Q3 | 護照 statement 要不要帶 nullifier？（nullifier 讓發證國與讀過晶片的人能認出你的 npub） | **分開**：L3 徽章的 statement 不帶；「成為護照見證者」另外開，開之前明講風險（G4 選項 A） | 一律帶並揭露；或不做計數 |
| Q4 | 同一本護照的衝突規則？ | **認持有人（裝置金鑰）不認 npub：先註冊者勝、三個月沒重簽才讓出**（G3 選項 A，不做 AA 所以沒有「AA 搶回」） | 維持「最新勝出」 |
| Q9 | App 的 ZK 套件要做什麼？ | **Semaphore「匿名的真人見證」**：護照 statement 背書一個 Semaphore identity commitment，見證時用 Semaphore 證明「我是其中一位已驗證的真人」，nullifier 來自用戶自己的秘密，發證國連不起來（順便解 G4）。在 P1 上線後另開 plan；zkTLS 等到要證明「登入後才看得到的資料」再回來。 | 先不做 ZK 套件；或先做 zkTLS |
| Q10 | passport-noir 0.5.0 要單顆電路（scoped 裝置標記），還是保留 OpenAC 的兩階段 commitment？ | **單顆電路**（§6.2）：少一顆電路、一個 vk、沒有跨證明的連結檢查；OpenAC 的選擇性揭露與 scoped 化名都還在。 | 保留兩階段（與 OpenAC 論文對齊，但多一顆電路與連結邏輯） |
| Q7 | 已發佈的 1.3.x 要不要另出 hotfix，關掉護照出示驗證？ | **不另出**，P0 跟 2.0.0 一起出；1.3.3 的解析 bug 實際上拒絕所有證明（§2.4），偽造在那一版過不了。 | 立刻出 1.3.x hotfix |

**我自己定、不用問的**：不做 AA、不做 CA、不做人臉比對；網頁不跑也不驗電路；護照資料永遠不進 QR；passport-noir 的 SRS 照實際大小（不乘 8）、電路 JSON 一律內建、vk 釘選。

**揭露時機（請 Kidney 知道）**：creds-app 與 passport-noir 都是公開 repo，`attestation.rs` 的註解本來就寫了這個信任模型，但這份 plan 把後果寫得很直白。本 session 只在本機 commit、不 push；建議 P0 合併、passport-noir README 加上警語後再 push 這份文件。
