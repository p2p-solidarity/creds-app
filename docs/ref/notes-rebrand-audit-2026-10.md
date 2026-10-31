# creds.id rebrand 後 App 盤點（2026-10-28）

唯讀稽核，未改 code。目標方向：**簡潔漂亮的「own-yourself linktree」＋ 可選 ZK**；核心 W3C、BYOK；商業模式 Potofu free / Pro；新增友鏈與 PR/聯盟行銷，讓用戶比別處有更多控制。
數字皆由 grep 實測（排除 `.claude/worktrees/`）；「路由引用數」= 其他檔案以字串字面值引用該路由的檔案數，0 = 沒有 UI 入口。

---

## 1. 功能去留

### 1.1 06-plan 已裁「砍」但 code 還在（直接執行）

| 子系統 | 現況 | 動作 |
|---|---|---|
| **sakura + shoutouts + push rail** | `src/sakura/`（9 檔）、`src/shoutouts/`、`app/shoutouts/*`（3 路由，0 入口）、`components/shoutouts/*` 仍在；`productionWipe.ts:49`、`groups/deliverySettings.ts` 還 import | 照 06 §2 砍；先拆 `productionWipe` 與 `deliverySettings` 的依賴 |
| **dag 沙盒** | `src/dag/` 仍 10 檔、`app/dev/dag.tsx`、`components/sandbox/*` | 只搬 `nostrAdapter`＋`node` 進 `src/nostr/`，其餘刪 |
| **offline/manager.ts** | 仍在（06 裁零 caller） | 刪 |
| **vault cloudSync.ts** | 06 裁砍（CloudKit 自訂型別地雷），`src/vault/cloudSync.ts` 仍在 | 刪 |

### 1.2 沒有入口的路由（0 引用）

`/cards/ocr`、`/contacts/manual`、`/contacts/picker`、`/credentials/issue`、`/id`、`/id/dashboard`、`/id/groups`、`/id/personal`、`/settings/disclosure`、`/settings/oidc-request`、`/settings/solidarity-qr`、`/settings/vc`、`/settings/web-editing`、`/share/qr`、`/shoutouts`

建議：
- **刪**：`/shoutouts`（見上）；`/settings/solidarity-qr`、`/share/qr`（Page 的 Share sheet 已取代，且名稱是舊品牌）；`/settings/web-editing`（Passkeys 畫面已收編，見 af5d274e）；`/id/*` 四個（舊 Swift 的 ID 分頁殘留，`zk-settings` 留著，其他已被 Me/Page 取代）。
- **收進 dev/二層（06 Q6：憑證皮夾保留但在二層）**：`/settings/vc`、`/settings/oidc-request`、`/credentials/issue`。
- **刪或合併**：`/contacts/manual`、`/contacts/picker`、`/cards/ocr`。People 已有 `ManualContactEntrySheet`、`ContactsAddSheet`，這些路由是重複的 sheet 版本。
- `/cards`、`/vault` 各只有 1 個引用（且都不在主流程上）。名片和 vault 在 linktree 方向下都不是主角，**這是產品決策 → 見 §6 Q1**。

### 1.3 跟新方向對齊的主幹（保留並打磨）

Me/Page（linktree 本體：`page/pageDesign.ts` blocks）、People、Verify（Bluesky/Nostr/passport ZK 徽章）、Share QR、Passkeys / identity-export（BYOK）、Pro、websign。

### 1.4 舊品牌字串

`en.json` 裡還有 26 處 `Solidarity`，例如 `app.name`、`onboarding.enter`、`completeStep.start`、`shareQr.*`、`solidarityQr.*`、`scan.readyHint`；另有 2 處 `solidarity.gg`。`blueskyConnect.error.clientMetadataUnavailable` 寫著 OAuth metadata 在 solidarity.gg，需要確認 Bluesky OAuth client_id 是否要搬到 creds.id。zh-Hant 也要同步改。IAP SKU 還是 `gg.solidarity.pro.yearly`（已上架就不能改，只改顯示名稱）。

---

## 2. 舊規範跟現在工作流不一致

| # | 位置 | 寫的是 | 實際上 | 建議 |
|---|---|---|---|---|
| 1 | `apps/expo/CLAUDE.md:3-5` | 「Port of `solidarity/` (SwiftUI)… 1:1 parity with Swift v1.3.1」 | Swift 已刪，方向是 creds.id linktree | 改寫開頭：creds.id app，web 對齊 creds.id |
| 2 | `.claude/skills/ui-polish/SKILL.md`「Square corners」 | 方角是品牌，不要修 | 0f597342 已把卡片和設定群組改成 12pt 圓角對齊 creds.id；`ThemedButton.tsx:11` 註解仍寫方角 | 決定按鈕要不要也圓角（§6 Q3），然後同步 skill 與註解 |
| 3 | 同上「Brand accent is mauve… primaryBlue」 | mauve 是品牌 | 1239dfa7 已引入 creds.id text/divider tokens；`Colors.ts:119-127` 仍寫「mirrors Swift」 | 以 creds.id 色票為準，改註解；`primaryBlue` 可改名為 `accent` |
| 4 | `CLAUDE.md` Rule 4 | 「Mirrors Swift `Color.Theme.*` 1:1」 | 已不是 | 刪這句 |
| 5 | `CLAUDE.md:134` | `brand/Wordmark.tsx ← Swift Wordmark.svg port` | rebrand 後應該是 creds.id wordmark | 確認 logo 資產 |
| 6 | ui-polish「Tabs are 3 (v1.3.3)」 | — | 仍是 3 個（People/Me/Verify），正確 | 拿掉版本號就好 |
| 7 | `CLAUDE.md` / ui-polish 的驗證指令 `bun run test` = unit + parity | 「parity」 | parity 測試正在被另一個 session 大量刪除（staged：colorTokens / preferencesKeys / cloudkitRecord…），剩 semaphore 兩支 | 刪完後 `test:parity` 只剩 frozen fixtures 用途，文件寫清楚 |
| 8 | `CLAUDE.md:159` 測試說明 | 「feature, security and parity tests」 | 全域規則：只留真 bug 回歸＋安全/加密/解析 | 改成跟全域 Tests 規則同一句 |
| 9 | ui-polish skill | 沒提 `feedback/motion.ts`、`PressableScale` | 已是實際的動效系統（PressableScale 84 檔使用） | 把 §3 的動效規則寫進 skill |
| 10 | 根 `CLAUDE.md` 列 06/07/08/09 為 live plan | — | 06 §2 一半已執行一半沒（見 §1.1），07 已被 08 部分取代 | 06 加「執行狀態」欄；07 標 superseded 的部分 |
| 11 | `docs/ref/notes-*` 9 份 | 舊稽核和研究 | `notes-ux-audit-backlog-2026-07`、`notes-functional-surface-audit-2026-08`、`notes-scope-audit-2026-09` 互相重疊，也被本文取代 | 併進 `notes-archive-pre-2.0.0.md` 或刪 |
| 12 | `docs/ref/01/03`（1.3.3 Verified Page spec） | Bluesky spine、airmeishi-web viewer mock | web 已是 creds.id 真站 | 01/03 標「history」，以 08/09＋本文為準 |

---

## 3. 動效：有 reanimated，但沒有「動態感」

### 3.1 現有底子（其實不差）

- `src/feedback/motion.ts`：SPRING（press/gentle/zoom）、SCALE、單一 ease-out `EASE_OUT`、DURATION（140/240/160）、STAGGER 40ms、enter preset。38 個檔案使用。
- `PressableScale` 84 檔使用；33 檔處理 reduce-motion；沒有 RN `Animated` 或 `LayoutAnimation` 混用。

### 3.2 為什麼感覺不夠好（依影響排序）

1. **只有進場，沒有退場和佈局動畫**：`entering=` 33 處、`exiting=` 只有 1 處、`layout={LinearTransition}` 0 處。新增、刪除或拖曳排序連結時，列表會直接跳。Linktree 的核心操作就是編輯連結，這是最大的落差。→ `ProfileLinksList`、`EditableLinksList`、`ProfileSectionsList`、`PagePreviewItems` 加 `exiting` + `itemLayoutAnimation={LinearTransition.springify()}`。
2. **載入用轉圈，不用骨架**：76 個 `ActivityIndicator`，0 個骨架或 shimmer（只有 `settings/security.tsx`）。主要表面（`MeProfileGate:53`、`ProfileSectionsList:126`、`people/index.tsx:665`）loading → ready 會整塊閃一下。→ 做一個 `Skeleton` primitive，長得跟 ready 的版面一樣（這仍符合 Rule 8：它是 loading 狀態，不是假資料）。
3. **沒有連續性轉場**：沒有 shared element 轉場（0 處）。People 列表 → 個人頁、Page 預覽 → 編輯、QR 呈現都是硬切。→ 先做兩處：頭像/卡片從列表到詳細頁，Page 預覽到全螢幕預覽。
4. **47 個檔案還在用原生 `Pressable` / `TouchableOpacity`**，沒有按壓回饋或 haptics，包括 `app/settings/index.tsx`、`BusinessCardRow`、`GroupMembersSection`、`ContactPickerView`、`FloatingTabBar`。→ 一律換成 `PressableScale`；`FloatingTabBar` 要另外做一個滑動指示器。
5. **舊時代的裝飾動畫風格不一致**：`SakuraIcon`（2s 呼吸）、`RippleButton`（2s 無限旋轉，兩份重複：`common/` 與 `id/`）、`PublishingConstellation`（520ms ease-inOut 脈動＋1150ms linear）、`SecureKeysStep`（620/520ms）、`CloudSyncPulse`（1100ms）、`PresentCardVisual:81`（delay 260ms + 900ms）。這些跟「damped & crisp」語言互相衝突，看起來像不同的 app。→ 刪或改成 motion token；只有「長時間等待」的狀態才可以用循環動畫，而且統一一種。
6. **28 處寫死 duration、8 處寫死 spring 參數**（例如 `scan/index.tsx:250-255`、`WinSystemErrorDialog:52`、`CryptoCompilingOverlay`、`PassportSteps:290`、`LaunchSplash`）。→ 全部換成 `TIMING` / `SPRING`。
7. **成功時刻沒有慶祝**：發布 Page、驗證徽章成功、交換名片成功，目前只有 toast。→ 加一個統一的「check 打勾 + 輕彈 + success haptic」primitive，在上述 3 個地方共用。
8. **`BumpFlash`（sandbox）用了 ease-in 400ms**，違反 motion.ts 自己的規則；它屬於要砍的 sandbox，砍掉就好。

### 3.3 收斂成 6 個 primitive（全 app 只用這些）

1. `PressableScale`：所有可點的東西（含 haptics）。
2. `enter` / `exit` preset：進場是淡入＋上升 8px＋stagger，退場是淡出＋縮小到 0.98，160ms。
3. `listLayout`：所有可編輯列表都用 `LinearTransition.springify()` + SPRING.gentle。
4. `Skeleton`：loading 狀態唯一的寫法。
5. `SheetTransition`：`ModalSheet` / `SlideUpSheet` 統一一種進出動畫。
6. `SuccessMark`：成功時刻。
寫進 ui-polish skill，並加一條 lint 規則：`withTiming` / `withSpring` 必須從 `@/feedback/motion` 取參數。

---

## 4. W3C 與 BYOK

### 4.1 W3C 現況

| 項目 | 現況 | 問題 |
|---|---|---|
| DID | `did:key` 為主（116 處），`did:web` 只用在 issuer 信任分級（`oidc/proofVerifier.ts:62`、`credentialIssuance.ts:393`），`did:plc` 只用於解析 atproto | 用戶身份 = did:key，OK。did:key 沒辦法換鑰，rotateMasterKey 等於換一個身份。建議 Pro 的 custom domain 同時提供 `did:web:<domain>` 作為別名，DID doc 列 did:key 為 `alsoKnownAs` / verificationMethod |
| VC context | **混用**：`credentials/v1`（`cards/didSignedCredentialPayload.ts:170`、`oidc/presenter.ts:368`、`credentials/presentationProof.ts:130`）vs `ns/credentials/v2`（`groups/credentialService.ts:109`） | 統一成 VCDM 2.0（`https://www.w3.org/ns/credentials/v2`，`validFrom` 取代 `issuanceDate`） |
| 證明格式 | VP 是 JWT（`typ: vp+jwt`，`oidc/presenter.ts:379`）；passport 走 SD-JWT | grep 沒找到 `dc+sd-jwt` / `vc+sd-jwt` typ。要符合 SD-JWT VC 規格需要設 `typ: dc+sd-jwt` 和 `vct`。沒有 Data Integrity（eddsa-rdfc-2022），JWT 路線可以接受，但要選一種、寫進 spec |
| 持有人綁定 | progress.md 已記錄過 VC/VP holder binding bug 並修過 | 保持；新功能（友鏈）也要套用 |

### 4.2 BYOK 現況（不錯）

- 24 字 mnemonic 匯出/匯入（`app/settings/identity-export.tsx`），經 Face ID gate；`ALWAYS_PROMPT_ACTIONS` 保留。
- 08-plan：passkey PRF 解鎖，伺服器只存密文（root vault owner index，01d5dc35）。
- 缺口：
  1. **「拿得走」不只是 key，還有資料**：Page JSON、連結、徽章 VC 應該要能一鍵匯出成標準格式（DID doc + VC + page JSON），並且能匯入到別的 host。目前只有 backup（iCloud/Drive），沒有開放格式匯出。
  2. vault 分片復原（06 defer）復原的是錯的 key，不能露出給用戶。

---

## 5. 商業模式、友鏈、聯盟行銷

### 5.1 Pro（對照 Potofu）

已建（09-plan）：Pro 年訂閱 IAP 雙平台，`src/pro/{entitlement,entitlementStore,purchases,useProGate}.ts`；Pro 鎖 `shop` / `booking` / `leave-card` 區塊、字型/背景色、移除品牌。缺：license bridge（綁 did 的伺服器憑證）、custom domain、數據分析。

建議切法（Potofu 式：免費版要大方，Pro 賣「控制權」）：

| Free | Pro |
|---|---|
| 無限連結、全部基本區塊（links/text/portfolio/featured/video）、徽章驗證、ZK 徽章、QR、mnemonic 匯出、開放格式匯出 | 自訂網域＋`did:web`、進階區塊（shop/booking/leave-card）、字型/主題/移除品牌、**點擊數據（隱私友善：只計數，不追蹤人）**、聯盟連結管理、多頁 |

原則：**身份和資料主權永遠免費**（BYOK、匯出、ZK），Pro 只賣外觀、網域和數據。這也是跟 Linktree 拉開差距的賣點。

### 5.2 友鏈（現在沒有）

最接近的東西：`pear/mutualExchange.ts`（面對面雙向交換名片）、`people/declared`、atproto 雙向 did 驗證（`atproto/discovery.ts:94` 防偽造 reciprocal）。

最小設計：
- 新增 page block `friends`（免費）。
- 友鏈 = **雙向簽章**：A 簽一筆 `FriendLink` VC（issuer=A did、subject=B did、B 的 page URL），B 回簽同一種；兩筆都存在才顯示「✓ 互相認證」，只有一方簽則顯示為單向連結（就是一般的 link）。
- 交換管道沿用現有的 QR / Pear mutual exchange / 或對方 creds.id 頁上的「請求友鏈」按鈕。
- 用戶可以隨時撤回（刪掉自己那筆簽章，對方頁面的 ✓ 就消失）。資料存在自己的 page JSON 裡，不經我們。

### 5.3 PR / 聯盟行銷（現在沒有）

最小設計：
- links block 的每個連結加上 `disclosure: 'affiliate' | 'sponsored' | 'gifted' | null`，頁面上自動顯示標示（符合 FTC / 台灣公平會要求）。
- 推薦碼欄位（`code`），訪客可以一鍵複製。
- Pro：點擊計數（creds.id worker 只記 `linkId + day` 計數，不記 IP 或 cookie），可匯出 CSV。
- 「比別處有更多控制」= 揭露方式由用戶決定、數據歸用戶並可以匯出、我們不抽成、也不插入我們自己的聯盟連結。

---

## 6. 需要你拍板的產品決策

1. **名片（`/cards`）和 vault 在 linktree 方向下要留嗎？** 建議：名片併入 Page（Page 就是名片），`/cards` 刪；vault 先藏起來（06 已 defer）。
2. **App 名稱**：`app.name` 還是「Solidarity」，要全面改成 creds.id 嗎？（i18n 26 處、Wordmark、商店名稱、Bluesky OAuth client metadata 網域）
3. **按鈕的方角**：卡片已經圓角了，按鈕要不要也跟 creds.id 一起改成圓角？建議改，現在方角按鈕配圓角卡片視覺上不一致。
4. **VC 統一成 VCDM 2.0 + SD-JWT VC（`dc+sd-jwt`）？** 建議是。舊的 v1 憑證只需要能驗，不再發。

## 7. 建議執行順序

1. 砍（§1.1 + §1.2 刪除清單）＋ 規範文件同步（§2）—— 機械性工作，一個 PR。
2. 動效 6 個 primitive，先套在 Me/Page 和 People（§3）—— 用戶感受最明顯。
3. Rebrand 字串和 Wordmark（等 §6 Q2 決定）。
4. VCDM 2.0 統一（安全路徑，L 級）。
5. 友鏈 → 聯盟連結 → Pro 數據（新功能，每項都需要 E2E 驗證）。
