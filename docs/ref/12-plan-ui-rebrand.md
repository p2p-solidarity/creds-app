# 12 — creds.id UI rebrand ＋ plan 10 P4／P5 精簡

> 2026-10-30 · 狀態：**程式完成，E2E 待整合後一起跑**（branch `claude/ui-rebrand-e95e94`，基於 2.0.0 `e9c4f09c`；由主 session 統一合併進 2.0.0）。
> Kidney 2026-10-30 盤點：底層堆得快，主線精簡（10 的 P4、P5）沒做；App 與 creds.id 網頁的圓角、細節對不起來；Reanimated 用得少；新增連結找不到第一步。這三件跟 rebrand 一起做，是目前最主要的工作。核心 ZK（護照 L3）保留但要更順。
> 本文件只寫階段與決定；P4／P5 的「做什麼」以 10 的 §4／§5 為準。

## 0. 決定（照建議執行，未另外問）

| # | 決定 | 理由 |
|---|---|---|
| R-D1 | 圓角與陰影 token 放 `src/constants/radius.ts`，數值 1:1 對 creds.id `theme.css`（button 6、card 12、group 12、field 2、xs 2、sheet 16、pill 999；`shadow-lift`／`avatar`／`sheet`）。Tailwind 同名 class（`rounded-card`…）。元件只准用 token；裝飾性的圓（頭像、點）用 `pill` 或 `size/2`。 | web 為準（ui-polish skill）。 |
| R-D2 | 新增連結：**加上就存**（Linktree 式），不再繞到 `/me/edit` 再按儲存。存檔照舊走 root 簽章（Face ID 一次，grace window 內不重問）。 | 現在 ~12 步的主因是「加 → 回編輯頁 → 儲存 → 回 Page → 找驗證」。 |
| R-D3 | 可驗證的平台（X／Telegram／GitHub／網站）加完後，同一張 sheet 直接接驗證（§2 的「複製並打開」）；可以「稍後」。`/verify/social` 保留給連結列上的驗證 chip，兩邊共用同一個驗證面板。 | 一套 UI；加完立刻到綠勾。 |
| R-D4 | 連結圖示：抓頁面的 `og:image`／`apple-touch-icon`／`icon`，GitHub 用 `github.com/<handle>.png`；只走 https、不連私有 IP（沿用 `httpsOwnership.ts` 的擋法）、限時限量。結果只存在本機快取（不進簽章紀錄，不改 shared schema）。 | 不擴大簽章格式；網頁之後要做再在 web 端自己抓。 |
| R-D5 | 頭貼：Page 沒有頭貼 → 社群個人頁頭像直接成為頭貼（跟著這次存檔一起簽）；已有頭貼 → 加完連結的畫面給「改用這張」一鍵替換。只用社群個人頁（X／Telegram／GitHub…）的頭像，不用網站 favicon。 | 照 session 指示的建議。 |
| R-D6 | P4：Present 只剩「一張卡」，QR 兩種：online（`creds.id/@name`，沒有名字時退回 nostr 短網址）／離線片段 URL。名片表單、名片 wire、卡片專屬欄位（電話、email）、預設組合、「證明」模式（sqc1 chunk QR）全刪。 | 10 §4、D9。 |
| R-D7 | 護照當面出示的 Pear 版本這一刀**不做**；只留 Page 上的 L3 徽章（照實顯示，Android 降級照實 `white`）。不顯示任何「可出示」的假狀態。 | Pear 出示是獨立的 L 工作；session 指示「做不完就先只留徽章」。 |
| R-D8 | 掃描端：只認 Page URL 與片段；舊單張名片 wire 的**解碼**留一個版本的過渡期（10 §4），chunk QR（sqc1）組裝刪除。 | 10 §4「舊 wire 給一個版本的過渡期後移除」。 |

## 1. 階段（每階段結尾在模擬器實跑＋截圖，`docs/e2e/2026-10-30-ui-rebrand-<phase>/`）

| 階段 | 內容 | 結束時的 E2E |
|---|---|---|
| **R0 基準** | 現況「新增連結 → 綠勾」逐步截圖、計步 | `…-r0-baseline/` |
| **R1 P4／P5 砍** | 刪 `/cards/edit`、名片 wire 產生端、Present「證明」模式與 chunk QR（含 §6 列的 5 支測試）、`/me/evidence-pack`、`/id/zk-settings`、`/groups/*` 路由與 UI（native semaphore 留）、`/settings/dids`、`/settings/groups`；Present 改成一張卡＋online／離線 QR；Settings 收斂 | Present 兩種 QR、Settings 首頁 |
| **R2 token＋品牌** | `radius.ts`＋tailwind；掃 `src/components/**`、`app/**` 所有寫死的 `borderRadius`；S 標→`CredsMark`；顯示用「Solidarity」字樣改 creds.id（Expo 專案名、scheme、keychain service、IAP SKU 不動） | 亮／暗各一輪主要畫面 |
| **R3 新增連結** | 共用 `LinkComposer`（貼上優先、剪貼簿偵測、自動偵測平台、平台格子備援）；Page 首屏一鍵「新增連結」；加上即存；接驗證面板；連結圖示與頭貼；onboarding `LinksStep` 用同一個 composer | 前後計步對照截圖 |
| **R4 動態** | 核心流程進場／退場／layout 轉場（`motion.ts`、`PressableScale`）：AddLink、LinksStep、verify/social、People 詳細頁、Settings；成功打勾 | 錄影抽幀或連續截圖 |
| **R5 收尾** | 5 條 user story 模擬器走一遍；`bun run typecheck && bun run lint && bun run test` | `…-r5-stories/result.md` |

## 1.1 執行紀錄與偏差（2026-10-30）

- **R1**：刪 `/cards/edit`、`/settings/{share-settings,privacy,dids,groups}`、`/groups/*`、`/id/*`、`/me/evidence-pack`、Present「證明」模式、`PassportShowPresentation`、CRD1／evidence pack 產生端。Settings 19→14 頁；「身分匯出（24 字）」原本沒有入口，接回帳號區。憑證詳情頁的護照不再出示（R-D7）。
  - **偏差**：`qrChunking`／`qrCompression` 測試**保留**——websign 仍用 sqc1（10 §4 明文保留到 08 上線）。`encodeEnvelopeToWire`／`buildSolidarityQrPayload` 保留，因為 `envelopeHandler` 的解碼安全測試用它們產測資；`solidarityQrPayload`／`qrEnvelopeWire`／`crd1Envelope`／`presentModel` 測試刪除。
  - 留給 passport session：`src/passport/useShowPresentation.ts` 已無呼叫者；`scan/showPresentationHandler` 與 `PassportShowChallengeSheet` 仍在（安全路徑，未動）。
- **R2**：`radius.ts` + tailwind 角色 class；全 App 數字圓角清零（剩 0 = 刻意直角、Page 模板半徑、手機框 24）。ThemedSurface `elevated` 用 `shadow('lift')`。People 空狀態的 S 弧形圖換成 creds.id 雙環標格子。
- **R3**：`AddLinkSheet` 共用（Page／onboarding／Me › Edit）。Page：「＋ 新增連結」放在連結列最上方與空狀態，直接開 sheet，加上即存（`quickAddLink`），可驗證平台接 `SocialVerifyPanel`。圖示＝`linkPreview`（沿用 ssrf session 的 `createPublicPageFetch`，cherry-pick 742a7755）＋本機快取。頭貼：沒有簽章頭貼也沒有本機頭貼 → 同一次簽章帶上；有 → 一鍵替換。onboarding 可連加多條，一次簽名。
  - 步數（從 Page 到綠勾）：舊 ≈12（＋新增 → 連結格 → Me › Edit → 貼上/選平台 → 加入 → 儲存 Face ID → 回 Page → 找驗證 chip → 複製並打開 → 貼 → 回來 → 加上綠勾 Face ID）；新 6（＋新增連結 → 貼上 → 加上 → 加上綠勾 → 複製並打開 → 回來後加上綠勾）。
  - 模擬器沒有 App Attest：`deviceAttestSupported()` 為 false，驗證按鈕不顯示——綠勾那段只能實機驗。
- **R4**：`motion.ts` 新增 `fadeOutSettle`、`LIST_LAYOUT`；People 詳細頁、Settings 首頁進場；可編輯連結列 enter/exit/layout；ThemedButton／名片翻面／編譯完成徽章改用 SPRING token。

- **E2E**：中途停（Kidney 決定所有 branch 合併後一起跑）。已跑：Page 空狀態、People 空狀態雙環標、新增連結 sheet、貼上網址自動偵測 GitHub＋抓到頭像。沒跑：按「加上」之後（存檔、頭貼、驗證）、Present 兩種 QR、Settings、LinksStep、R4 動態、暗色、5 條 user story。見 `docs/e2e/2026-10-30-ui-rebrand-r3/result.md`。
- **合併注意**：face-id branch（`claude/clever-napier-5d15c2`，e1f21a5a）改了 `src/cards/solidarityQrRuntime.ts`，本 branch 刪了它（P4）→ modify/delete 衝突，保留刪除；合併後 `signOwnCardJwt`／`signOwnCardRaw` 只剩測試在用。i18n 兩支 locale 三個 branch 都有改，`git merge-tree` 試合沒有衝突。

## 2. 不做（這一刀）

- Pear 當面護照出示（R-D7）。
- `src/passport` 證明邏輯（另一 session 在改 passport-noir／OpenAC）、`src/nostr/*`（另一 session 在改讀取速度）。
- shared 的 Page schema（連結圖示不進簽章，R-D4）。
- websign 傳輸的 chunk QR（10 §4：等 08 passkey 同步上線後評估）。
