# 2026-10-29 creds.id 品牌更新（logo / 字型 / 背景 / Home 互動 / AEO）

## 實際跑過的

**App（iPhone 17 模擬器，iOS 27，dev client 重 build 以嵌入字型）**
- 開場動畫：`splash-1-rings-swing-in.png`（雙環從兩側轉入、字標淡入）→ `splash-2-locked.png`（扣合，紫色「.」與 i 點落位）。
- 字型：`page-fonts.png`——名字 DM Sans、內文與 `creds.id/@handle` 為 Inter（原本 Menlo）。`UIAppFonts` 已含 6 個字檔。

**Web（`bun run dev`，內建瀏覽器，1280×800）**
- header / 卡片 / footer 換成新 logo；favicon、apple-touch icon 重產。
- /app、/edit、首頁 statements：星球換成淡色 C 環；/app 範例名稱「creds dev」（fixture 重簽）。
- 飛鴿：點 email → 900ms 後才開 mailto；用 Animation API 推進時間驗證軌跡（蹲→跳→弧線飛出→1.3s 回到欄杆）。
- 下載 App：單排 + iOS/Android 切換；點擊切換、hover 預覽、離開還原皆以 DOM 驗證。
- 金鑰簽章：28 顆星、8 顆火花、兩圈光環的 WAAPI 關鍵影格已驗證。
- 卡片：彩箔漂移、雙環扣合、平台章落位漣漪的動畫已掛上（DOM 驗證）。
- 聯絡區燈塔：燈束左右掃、燈室光暈呼吸、8 扇窗各自不定時熄燈再亮、射線尖端與頂珠星點閃爍；點燈塔→燈室閃光、窗戶由下往上依序點亮。深／淺色都用暫停動畫截圖目視確認，點擊後 9 段動畫實際跑完（finished）。
- FAQ 移進金鑰簽章區（星空下），預設 `hidden="until-found"`、高度 0；點鑰匙→簽章特效＋FAQ 展開，900ms 後捲到 FAQ；`beforematch` 事件也會展開；鍵盤用 focus 才出現的按鈕。FAQPage JSON-LD 的 url 改回首頁（`/#faq` 在 creds.id 會被當成頁面 payload →「內容格式錯誤」）。
- `bun run build`：`dist/` 內有 llms.txt、llms-full.txt、index.md、app.md、sitemap.xml、robots.txt、agent-skills；`index.html` 有 keywords、JSON-LD（Organization / WebSite / WebApplication / FAQPage）與 `<noscript>` 摘要。

`logo-lockup.png`：生成器輸出的淺／深色 lockup。

## 驗證指令
- airmeishi：`bun run typecheck && bun run lint && bun run test` → 0 error；1667 + 78 pass。
- airmeishi-web：`typecheck`、`oxlint`、`bun test`（238 pass）、`bun run verify` 全過。

## 沒驗證到的
- 內建瀏覽器面板全程是隱藏的：CSS／WAAPI 動畫不會自己播放，IntersectionObserver 和 rAF 也不跑。所以首頁「首次進入自動簽章」、星空漣漪、鴿子即時飛行都只用 DOM 或手動推進動畫時間驗證，沒有目視看過。
- `functions/_middleware.ts`（`Accept: text/markdown`）和 `_headers` 的 Link／Content-Signal 只在 Cloudflare Pages 上生效，本機沒跑。
- Android 沒跑；字型理論上靠同名 TTF 對應。
- OG 分享圖（`og-card.jpg`）仍是舊的 Fraunces 字標加星球，還沒重做。
- Vite dev 刪除 webp 後會卡住模組載入（重啟 dev server 就好），是開發環境問題，production build 正常。
