# 結果 — 2026-11-06 合併後 2.0.1 冒煙測試

範圍：2.0.1 合併 page-editor-ux、present-share-url、contacts-unify、proof-detail-cleanup、nip17-verify 五支分支，加上 `c3d23f08`、`05d5d529`（分享面板 QR 維持 `/@name`）。各分支自己的 E2E 在各自的 `docs/e2e/2026-11-05-*/result.md`；這裡只驗證合在一起後沒壞。

Build：iPhone 18 Pro（793562A3）上既有的 debug dev client（2.0.1 原生 + expo-network，present-share 編的），JS 由主 checkout 的 Metro :8082 `--clear` 提供。帳號 `e2etextblk`。沒有發布、沒有改遠端資料。

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| M1 頁面 tab | 頁首 `creds.id/e2etextblk`（無 @）；區塊預覽不收合、薄荷背景 | 同預期 | PASS | `01-launch.png` |
| M2 出示 tab | 卡上 `creds.id/e2etextblk`；材質可選；線上 QR = `/@e2etextblk` | creds night 卡、四個材質；zbarimg 解出 `https://creds.id/@e2etextblk` | PASS | `02-present.png` |
| M3 聯絡人 tab | 一種列樣式、@name、同名合併建議 | 「Gimmy Chang」有兩筆＋合併／不是同一人；@gimmy | PASS | `03-people.png` |
| M4 頁面分享面板 QR | 顯示連結 `creds.id/name`，QR = `/@name`，QR 會出來 | 第一次一直「產生中…」：`QrPreview` 拿 `selected.url` 比對 QR 網址 → 修 `05d5d529` 後 QR 出現，解出 `https://creds.id/@e2etextblk` | PASS（修正後） | `04-me-share.png` |
| M5 複製連結 | 剪貼簿 = `https://creds.id/e2etextblk` | 同預期（`simctl pbpaste`） | PASS | — |

驗證指令（合併 nip17 後）：`bun run typecheck && bun run lint && bun run test` exit 0（lint 0 error；unit 1273、parity 54 pass）。

## 沒跑

- 斷網時線上 tab 反灰（要實機）、真機 App Attest / NFC 護照、Android、深色模式。
- NIP-17 S1（冷啟動就發布 10050）在 App UI 上 INVALID，只有 relay harness 證據；Kidney 的 TestFlight 收到含修正的 build 後，用唯讀腳本查 `c2f411c2…` 有沒有 10050。
- 模擬器上的舊聯絡人紀錄解密失敗（`contacts:recent-updates:v1` 等）：這台模擬器在 NIP-17 測試時還原過別的助記詞，是測試環境狀態，App 會略過，不是合併造成的。
