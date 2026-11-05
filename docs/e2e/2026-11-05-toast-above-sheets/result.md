# Toast 畫在原生 sheet 上面 — 2026-11-05

## 問題

`ToastOverlay` 掛在 root layout。iOS 的 formSheet／pageSheet（`ModalSheet`）一打開就會蓋住 root view，所以 sheet 裡呼叫的 `pushToast` 都看不到，例如 Face ID 失敗、存檔結果、送出失敗。這是 NIP-17 E2E 的 C7 第一次 FAIL 時發現的；當時只在私密交換的兩個 sheet 裡改成顯示行內錯誤。

## 修法

- **iOS**：`ToastOverlay` 有 toast 時，改用 `FullWindowOverlay`（react-native-screens）來畫。這和 `WindowOverlay`（confirm／alert）讓對話框蓋在原生 sheet 上的是同一個機制。容器在沒點到子 view 時 `hitTest` 回傳 nil，外層又是 `box-none`，所以只有 toast 卡片本身會接收觸控。沒有 toast 時不掛載。
- **Android**：sheet 是獨立的 dialog 視窗，所以 `ModalSheet` 和 `SlideUpSheet` 裡各自再掛一份 `<ToastOverlay />`。

## 實測

iPhone 18 Pro 模擬器（iOS 27.2）。用已安裝的 Release `.app`，把 `main.jsbundle` 換成 `expo export:embed --bytecode` 打出來的版本。

臨時加了一個 harness（沒有 commit）：啟動 3 秒後打開 `ModalSheet`（formSheet），1.5 秒後在 sheet 開著時呼叫 `pushToast('E2E toast above sheet')`。

| Case | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| T1 修正前（`toast.tsx` 用 HEAD 版本，harness 相同） | toast 被 sheet 蓋住 | 只看到 sheet，沒有 toast | 確認 bug | `before-fix-toast-hidden.png` |
| T2 修正後 | toast 畫在 formSheet 上面 | toast 出現在 sheet 頂端、蓋在 sheet 上面 | PASS | `after-fix-toast-above-sheet.png` |
| T3 移除 harness 後的乾淨 bundle | 冷啟動正常 | 正常顯示 onboarding 第 1 頁，沒有新的 crash report | PASS | `clean.png`（本機） |

驗證指令：`bun run typecheck && bun run lint && bun run test` → typecheck 0 錯誤、lint 0 errors、unit 1257 pass、parity 54 pass。

## 沒有跑的

- Android：在 `ModalSheet`／`SlideUpSheet` 裡掛 toast 這部分沒有實測。
- 實際點擊 toast 以外的區域，確認觸控有穿透：模擬器上沒有可以點擊的工具，這點只靠讀原生實作確認（`RNSFullWindowOverlay.mm` 的 `hitTest`／`pointInside`）。
- 沒有逐一走過各個 sheet 的實際流程（存入 People、Face ID 失敗等），只用 harness 驗證了 sheet 和 toast 的疊放順序。
