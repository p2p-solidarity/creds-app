# UI rebrand — E2E（中途停）

2026-10-30 · iPhone 18 Pro 模擬器（iOS 27）· dev client + Metro 8083 · branch `claude/ui-rebrand-e95e94`

**狀態：中途停。** Kidney 決定所有 branch 由主 session 合併進 2.0.0 後，E2E 一起跑。主機當時負載 100–900、磁碟滿，操作很慢。

## 已跑

| 截圖 | 看到什麼 |
|---|---|
| `../2026-10-30-ui-rebrand-r0-baseline/00-page.png`、`people-empty-old-s-mark.png` | 改版前：Page、People 空狀態的舊 S 標 |
| `00-people-empty-credsmark.png` | People 空狀態換成 creds.id 雙環標格子 |
| `01-page-empty.png` | Page 首屏有「＋ 新增連結」 |
| `02-sheet-compose.png` | 點一下就開共用的新增連結 sheet（貼上欄＋平台格子） |
| `03-pasted-detected.png` | 貼上 `https://github.com/kidneyweakx` → 自動偵測 GitHub、顯示 @kidneyweakx 和抓到的頭像，「加上」變可按 |

旁證：一開始點「新增連結」沒反應，是先前誤點 LogBox 警告卡住；App 重開後正常，不是產品問題。

## 沒跑（整合後要補）

- R3 後半：按「加上」→ 存檔（Face ID）→ 頭貼直接套用／一鍵替換 → 驗證面板。模擬器沒有 App Attest，驗證按鈕不會出現，綠勾那段只能實機。
- 步數對照：舊 ≈12、新 6 是照程式路徑數的（見 `docs/ref/12-plan-ui-rebrand.md` §1.1），還沒有實際截圖。
- R1：Present 的 online／離線兩種 QR、Settings 首頁收斂。
- R2：亮／暗各一輪主要畫面。
- R4：AddLink、LinksStep、People 詳細頁、Settings 的動態。
- onboarding `LinksStep` 連加多條。
- 5 條 user story。
- repo root `bun run typecheck && bun run lint && bun run test`：這一輪沒跑完整版（只跑了改到的檔案）。
