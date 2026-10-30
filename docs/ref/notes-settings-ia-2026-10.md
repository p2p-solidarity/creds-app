# Settings／導覽層級收斂（2026-10-30）

起因：Kidney「設定層級太多」「很多頁因為功能砍了還埋在很深的地方」。目標：從設定首頁出發，任何畫面 ≤ 2 次點擊；只有 1–2 個控制項的頁面改成首頁上的行內列；只剩被砍功能在用的路由刪掉。

## 路由盤點（`apps/expo/app/`）

| 路由 | 誰連過來 | 控制項 | 狀態 | 處置 |
|---|---|---|---|---|
| `settings/index` | Page 齒輪 | 16 | 產品 | 收斂（下表） |
| `settings/username` | 首頁、Page 分享卡、連結列、SocialVerifyPanel | 輸入框＋送出 | 產品 | 留 |
| `settings/passkeys` | 首頁、Page | 清單 | 產品（安全） | 留 |
| `settings/security` | 首頁 | 3 模式＋1 危險 | 產品（安全） | 留 |
| `settings/backup` | 首頁、data-sync、`credsid://settings/backup` | 6 | 產品（安全） | 留 |
| `settings/identity-export` | 首頁 | 5 | 產品（安全） | 留 |
| `settings/pro` | 首頁、Pro 閘門、Page 新增 | 5 | 產品 | 留 |
| `settings/appearance` | 首頁 | 1 段落（系統／淺／深） | 產品 | **改首頁行內段落，刪頁** |
| `settings/language` | 首頁 | 2 選 1 | 產品 | **改首頁行內段落，刪頁** |
| `settings/notifications` | 首頁 | 1 開關 | 產品 | **改首頁行內開關，刪頁** |
| `settings/advanced`（重設選項） | 首頁 | 2 危險列 | 產品 | **改首頁「重設」區，刪頁**（Face ID 閘門照舊 `rotateMasterKey`） |
| `settings/connections` | 開發者頁；People 的 Pear「開啟連線設定」 | 狀態＋發布＋2 開關 | 開發者閘門 | **刪頁**：Pear 開關移到首頁（一般用戶原本按「開啟連線設定」會被彈回首頁、找不到開關）；自動發布開關＋Nostr 發布列移進開發者頁；發布狀態看 Page 的發布卡與 `verify/nostr` |
| `settings/data-sync` | 只有開發者頁 | 備份連結（重複）＋計數＋1 危險 | 開發者 | **刪頁**；「重設身分金鑰（僅本機）」先移進開發者頁，後經 Kidney 決定刪除（見文末） |
| `settings/developer` | 首頁（開發者模式） | 11 | 開發者 | 留，兩個「掃描」列併成一個 |
| `settings/developer/verification` | 開發者頁 | 工具清單 | 開發者 | 留（首頁→開發者→工具 = 2 次） |
| `verify/social` | **沒有**（Page 連結列改成行內驗證 `checkJobs.ts`；AddLinkSheet 直接嵌 `SocialVerifyPanel`） | 0 | 死路由 | **刪** |
| `verify/nostr` | 連結列、SocialVerifyPanel、（原 connections） | 7 | 產品（發布） | 留 |
| `verify/bluesky` | 只有 Page 的「檢查失效」修復提示 | 5 | 產品（10 D7 保留 Bluesky 綁定） | 留；**注意**：沒有新建入口，只能修復舊綁定 |
| `(tabs)/verify` | 分頁「出示」 | — | 產品（路由名沿用） | 留 |
| `credentials/{index,[id],offer}` | 開發者頁、徽章 chip、`credentialOffer` deep link | — | 二層（憑證皮夾） | 留 |
| `oidc/consent`、`websign/review` | deep link、掃描 | — | 二層 | 留 |
| `people/[id]`、`people/profile/[did]`、`people/declared/[id]` | People、掃描結果、`card`／`pear` deep link | — | 產品 | 留 |
| `passport/index` | Page、憑證詳情、驗證工具 | — | 產品（安全） | 留 |
| `contacts/import-{phone,vcf}`、`legal/*`、`me/edit`、`scan`、`onboarding` | 各自入口 | — | 產品 | 留 |

## 設定首頁（之後）

| 區 | 列 | 形式 |
|---|---|---|
| 公開頁面 | 我的名稱 | → `username` |
| 帳號 | 通行密鑰／帳號保護／備份與救援／復原助記詞 | → 子頁（安全路徑，不動） |
| 方案 | 方案 | → `pro` |
| 偏好設定 | 外觀（跟隨系統／淺色／深色）、語言（English／繁體中文）、顯示「最近更新」、允許私密名片交換 | 行內 |
| 資料 | 匯出聯絡人、匯入 vCard | → |
| 重設 | 重設 App 資料、刪除護照證明 | 行內危險列 |
| 開發者（開發者模式才出現） | 開發者選項 | → `developer` |
| 關於 | 重播引導、隱私權政策、版本（點 5 下開開發者） | → ／行內 |

設定子頁：14 → 8（username、passkeys、security、backup、identity-export、pro、developer、developer/verification）。

## 安全相關：Kidney 決定刪除（2026-10-30）

這次刪的都是 `app/` 下的畫面殼；三個重設動作（`rotateMasterKey` 閘門）只是換位置。原本待決的兩項，Kidney 回覆「Delete both」：

- 開發者頁「重設身分金鑰（僅本機）」：已刪 UI 列、處理函式與 `dataSync.resetKeys.*` 字串。`resetSigningKeyForTesting` 本身保留——帳號保護的「替換安全登入」和 parity 測試還在用。
- `src/passport/useShowPresentation.ts`：passport session 已在 `4df32992` 刪除，目前零呼叫者，無須再動。
