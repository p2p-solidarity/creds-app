# Plan — Present 分享網址 / 卡面 / 線上離線 / 卡背（2026-11-05）

分支 `claude/present-share-url-718377`。裝置：模擬器 `iPhone 18 Pro`（793562A3），Debug dev client，從本 worktree 建（含新原生模組 expo-network），Metro 從本 worktree 起。

| ID | 目標 | 步驟 | 預期 | 在哪裡驗 |
|---|---|---|---|---|
| B0 | 基線 | 開 App → 出示 | 記下：有無名稱、卡上網址、線上分頁是否可選 | 截圖 `b0-present.png` |
| C1 | 卡上網址 | 出示頁看卡正面 | 有已註冊名稱：`creds.id/<name>`（無 `@`、無 npub）；沒名稱：短網址或「尚未發布」 | 截圖 + 畫面文字 |
| C2 | 卡面跟著材質換 | 卡下方點 不鏽鋼 → 黑鈦 → 黃銅 → creds 夜空 | 出示頁的卡本身換色；creds 夜空有極光、星星 | 每步截圖 `c2-<finish>.png` |
| C3 | 卡背固定 | 點卡翻面（steel、creds 各一次） | 中央是 creds 標誌，不是 wifi / `?` | 截圖 `c3-back-<finish>.png` |
| C4 | 實體卡預覽 | 點「訂製實體卡」 | 4 個選項 2×2，預覽跟目前卡面一致；切換後回出示頁卡面也變 | 截圖 `c4-sheet.png` |
| C5 | 有網路時線上可選 | 出示頁（Mac 有網路） | 頁面已發布時「線上」可選，QR 出現 | 截圖 |
| C6 | 沒網路時線上不可選 | 需要讓手機斷網 | 「線上」反灰、自動顯示離線卡和「這支手機現在沒有網路」 | **模擬器做不到**：模擬器跟 Mac 共用網路，斷 Mac 網路會斷掉這個 session。預先標 UNVERIFIABLE，需要實機 |

清理：不改任何遠端資料（不註冊名稱、不發布）。跑完停掉自己的 Metro、在 sim-queue 記 released；不關模擬器。
