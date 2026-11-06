# iPad 頭像「從照片圖庫選擇」picker 被 sheet 蓋住 — 2026-11-06

## 範圍與 build
- 修正：`apps/expo/src/components/me/useAvatarEditor.ts` — 先關閉頭像 sheet，等 iOS `Modal.onDismiss`（`ModalSheet` → `AvatarPickerSheet.onDismissed`）後才呼叫 `launchImageLibraryAsync`；Android 無 dismiss 事件，關 sheet 後直接開 picker。失敗時重開 sheet 顯示錯誤。權限請求仍在 sheet 開著時做（系統 alert 永遠在最上層）。
- Build：Release sim（`-configuration Release -sdk iphonesimulator ARCHS=arm64`，scratchpad derivedData），2.0.1 工作樹 + 本修正。確認 bundle 含修正：已刪除的 `meEdit.avatar.savingOnDevice` 字串在 main.jsbundle 出現 0 次。
- 裝置：iPad Pro 13-inch (M5) `9B375057`（iOS 27.2）、iPhone 18 Pro `793562A3`。帳號 credsdesign（已登入）。Photos 權限以 `simctl privacy grant photos` 給予。

## Baseline（舊 build，未修正）
A0：iPad 點「從照片圖庫選擇」→ 畫面無變化（`A0-baseline-old-build-after-tap.png`）；按 X 關掉 sheet 後 picker 才出現。重現回報的問題。

## 結果
| Case | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| A1 iPad 開 picker | sheet 關閉，picker 立刻在最上層 | sheet 滑出後 picker 出現，前面無 sheet（跑了 2 次皆同） | PASS | `A1-before.png`, `A1-after.png`, `A3-picker.png` |
| A2 iPad 選照片 | picker 關，Page 頭像變成該照片，toast | 頭像變花朵照片，toast「已更新這台裝置上的照片」 | PASS | `A2-crop.png`, `A2-after.png` |
| A3 iPad 取消 | 回 Page，無 sheet，頭像不變 | 回 Page，無 sheet，頭像仍為花朵 | PASS | `A3-after.png` |
| B1 iPhone 開 picker + 選照片 | picker 開，選後頭像設定 | picker 全螢幕 sheet 出現，選 logo → toast「已更新這台裝置上的照片」 | PASS | `B1-picker.png`, `B1-after.png` |

整體：PASS。

## 其他 picker 呼叫點（code review，未測）
`DocumentPicker.getDocumentAsync` 只在 `app/contacts/import-vcf.tsx`、`app/credentials/index.tsx`，兩者都是一般 stack 畫面上的按鈕，不在 RN Modal sheet 內，沒有同樣問題。`launchImageLibraryAsync` 只有頭像這一處。

## 未驗證
- Android：關 sheet 後直接開 picker（無 onDismiss），未在 AVD 跑。
- 「儲存失敗 → 重開 sheet 顯示錯誤」路徑未觸發。
- 關 sheet 時 sheet 內容先清空、白卡滑出約一個 frame（`AvatarPickerSheet` 只在 `visible` 時渲染內容；原本按 X 關閉也是如此，非本次引入）。

## 狀態變更與清理
- iPad：測試後用「移除」刪掉本機頭像（`A-cleanup-removed.png`，toast「已移除個人照片」），回到 baseline（無本機頭像）。Page record 沒有 avatar，沒有發佈。
- iPhone 18 Pro：本機頭像選回原本的 creds logo；App 換成本次 Release sim build（原本也是 Release build）。
- `xcrun simctl shutdown all` 已執行。
