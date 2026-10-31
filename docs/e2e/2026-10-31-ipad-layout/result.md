# 2026-10-31 iPad 版面（RWD）＋ ASCII 鍵盤 ＋ onboarding 續接

起因：`docs/e2e/2026-10-31-store-screenshots/result.md`「iPad 操作／RWD 問題」1、3、4、5、7。

## 改了什麼

- **內容欄上限**（`src/constants/layout.ts` `ContentWidth`：page 680 / form 560 / card 420）。
  套在兩個 navigator 共用的 `screenLayout`（`src/navigation/themeRefresh.tsx`），所以每個葉畫面
  （三個分頁、onboarding、設定、編輯器、詳細頁）都置中在 pageBg 上；onboarding、`settings/username`、
  `verify/bluesky|nostr` 用 560；相機畫面（`scan`、`passport`）維持滿版。手機寬度小於上限，畫面不變。
- 下方分頁列的三個按鈕也限在 680 欄內（分隔線仍滿寬）。
- `ProfileHero`、`PresentCard` 的 QR 尺寸改讀內容欄寬（`useContentWidth`），不再讀整個視窗寬。
- **出示頁金屬卡**最寬 420pt（名片大小）、置中。
- **Sheet**：`ModalSheet` 在 iPad 一律用 `formSheet`（新增連結、個人照片等）；`SlideUpSheet`
  限 680、「新增聯絡人」抽屜與 onboarding「名稱已被使用」抽屜限 560 置中。
- **鍵盤**：`ThemedTextInput` 的 `handle` / `url` / `secret` / `did` 一律 `keyboardType="ascii-capable"`、
  `spellCheck={false}`（原本就關 autocorrect / autocapitalize）。實測 iPad 上 `keyboardType="url"`
  仍會開注音，所以 URL 也改 ascii-capable（`LinkPageImportSheet` 的原生輸入框同步）。
- **Onboarding 續接**：新 pref `onboardingProgress`（step + keysGenerated），每步寫入、完成時清空；
  重開 App 從存的那步開始。從設定「重新播放」不讀也不寫。

## 實際跑了什麼（iPad Pro 13 吋 M5 暫時模擬器，iOS 27，開發版 + 本機 Metro，跑完已 shutdown + delete）

全新安裝走 onboarding（zh-Hant）：

- `after/10-onboarding-welcome.png`、`11-onboarding-username-ascii-keyboard.png`：560 欄；名稱欄是英文鍵盤（空白鍵標 EN）。
- `after/12-onboarding-resumed-after-relaunch.png`：到第 3 步（passkey）後 `simctl terminate` + `launch`（新 PID），回來仍在第 3 步、名稱 `credsipadqa` 保留。
- `after/20-add-link-formsheet-url-zhuyin-BEFORE-FIX.png` → `21-add-link-formsheet-url-ascii.png`：新增連結是置中 formSheet；修正前 URL 欄開出注音，改 ascii-capable 後是英文鍵盤。
- `after/01-page.png`、`03-present.png`、`04-contacts.png`、`06-add-contact.png`、`22-profile-photo-formsheet.png`、`30-settings.png`、`31-settings-dark.png`。
- `before/`：同一天商店截圖 session 在同型號模擬器拍的原始 iPad 截圖（手機版拉滿 1032pt），對照用。

注意：走 onboarding 時名稱 `credsipadqa` 已寫進正式 creds.id 目錄（App 正常流程，和商店截圖 session 的 `credsstudio` 一樣），需要的話要另外清掉。

## 沒跑／不能當作已驗證

- Page 編輯器（`me/edit`）、詳細頁、出示頁的實體卡 sheet 沒有在 iPad 上逐一開來看，只靠同一個 `screenLayout` 套用。
- 硬體鍵盤：`keyboardType` 對硬體鍵盤無效，接實體鍵盤時仍可能打出注音；沒測。
- 完成 onboarding 後 `onboardingProgress` 清空這一步沒有另外驗證（程式路徑只有一行）。
- 橫向沒做（`orientation: portrait` 保持）；字級與密度沒有為 iPad 放大（問題 2 未處理）。
- iPhone 沒有重跑；手機寬度小於所有上限，理論上無變化。
- Android 平板沒跑。

## Verify

`bun run typecheck && bun run lint && bun run test`：exit 0（unit 1503 pass / parity 73 pass，lint 0 error）。
