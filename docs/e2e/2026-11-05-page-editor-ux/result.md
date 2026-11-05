# Page 編輯器 UX — E2E 結果（2026-11-05）

範圍：區塊手勢（拖曳排序 / 左滑移除）、Me › 編輯自動草稿 + 離開警告、連結圖示單一路徑、背景色根因。
建置：共用 iPhone 18 Pro 模擬器（iOS 27.2）上的 debug app `kidneyweakx.airmeishi`，JS 由 worktree `page-editor-ux-691c0a`（branch `claude/page-editor-ux-691c0a`）的 Metro :8081 提供。測試帳號 `e2etextblk`。截圖在本資料夾（gitignored，只留本機）。

## 結果

| Case | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| S1 編輯區塊 sheet | 沒有 上移/下移/隱藏/移除；預覽釘在頂端 | 同預期 | PASS | S1-editor-sheet.png |
| S2 長按拖曳排序 | 拖到上方後順序對調 | 空的文字區塊移到 "I'm Life…" 上方 | PASS | B0 → S2-after-drag.png |
| S3 左滑移除＋取消 | 滑動時露出紅色垃圾桶；放開跳確認；取消保留 | 紅條出現；確認框「移除「…」？」；取消後區塊還在；滑回去放開不跳確認 | PASS | S3-swipe-strip / S3-swipe-confirm / S3-cancel-kept / S3-swipe-back-noconfirm |
| S4 確認移除 | 區塊消失、數量 -1 | 2/6 → 1/6 | PASS | S4-confirm / S4-removed |
| S5 區塊不再可折疊 | 標頭沒有 chevron，新增區塊後立刻看得到 | 沒有 chevron；新增「文字」後 2/6 直接畫在預覽裡 | PASS | B0 / S2 |
| D1 離開警告 | 「尚有變更未發布」＋ 先離開 / 繼續編輯 | 同預期 | PASS | D1-leave-warning.png |
| D2 草稿還原 | 重開編輯，自介仍是剛打的字，加上提示列 | 「接著上次還沒發布的草稿。」＋ "draft bio e2e" | PASS | D2-draft-restored.png |
| D3 捨棄草稿 | 確認後回到已發布內容，提示列消失 | 同預期 | PASS | D3-discard-confirm / D3-discarded |
| L1 連結圖示一致 | 新增連結預覽、連結清單、Page 預覽都畫同一個品牌磚 | GitHub 三處都是同一個 GitHub 磚（不再抓大頭貼） | PASS | L1-addlink-tile / L1-editor-vs-preview |
| BG1 背景改薄荷 | 設計預覽與區塊預覽變薄荷；設計 sheet 內有發布按鈕 | 兩處都是薄荷；設計 sheet 底部出現「發布頁面變更」 | PASS | BG1-mint-design-sheet / BG1-design-sheet-publish-card / BG1-sections-preview-mint |

整體：範圍內 10/10 PASS。

## 沒跑的

- 真的按「發布頁面變更」送上 relay（會改遠端資料；這次沒做）。發布流程本身沒改，只是搬進 `usePagePublish` 共用。
- VoiceOver 的 delete / increment / decrement 動作。
- Android。

## 背景色根因（查證，非 UI 測試）

- 已發布的資料**有**帶顏色：relay 上 gimmy 最新的 `solidarity.profile`（2026-11-01 14:35 UTC）`page.appearance = {template:"gradient", background:"mint", font:"serif"}`；creds.id/gimmy 的 `.pub` 實際畫的是 `#E9F6EF`（薄荷）。web 這端是對的，資料也沒缺。
- relay 上最新的 Page 是 11-01。之後在 App 改的設計從沒發布出去，所以 web 一直是舊的。
- App 端的原因：設計變更只是本機草稿，「發布頁面變更」按鈕只在 頁面 tab 最底下（區塊預覽下面），設計 sheet 裡沒有；頁面 tab 的頭像區和連結清單是 App 外框（跟著 App 主題），本來就不會變色。所以改了背景看起來「什麼都沒變」，也沒人去按發布。另外薄荷 `#E9F6EF` 很淡，跟米白放在一起不明顯。
- 修法：設計 sheet 底部加上同一個發布按鈕（`usePagePublish`，跟區塊列表共用一條發布路徑）。web 不用改。

## Deviations

- 模擬器截圖工具會慢一拍，判定一律以 `xcrun simctl io … screenshot` 為準。
- 測試帳號留下一份沒發布的本機草稿（GitHub 連結 + 薄荷背景）。
