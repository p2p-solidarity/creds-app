# E2E 結果 — F-Droid flavor（2026-11-03）

計畫：`plan.md`（同目錄）。

## 範圍與建置

- 分支 `claude/fdroid-flavor-297c83`；`EXPO_PUBLIC_CREDS_DISTRIBUTION=fdroid ./gradlew :app:assembleFdroidRelease -PreactNativeArchitectures=arm64-v8a`
  → `app-fdroid-release.apk`（release JS bundle，環境變數在建置時 inline，與 F-Droid 實際出貨一致；debug keystore 簽章；versionCode=1，因為 prebuild 時沒設 `ANDROID_VERSION_CODE`）。
- 裝置：既有 AVD `aniseekr_test`（API 36、arm64、google_apis image）。安裝後關閉 Wi-Fi／行動數據並開飛航模式，onboarding 的名稱發佈因此失敗（畫面顯示 "not published yet"），creds.id 目錄與 relay 都沒有被寫入。

## 判定

| Case | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| C1 classpath | `fdroidReleaseRuntimeClasspath` 沒有 gms／mlkit／firebase／billingclient | 0 筆符合；剩下的 `com.google.*` 都是 Apache-2.0 函式庫（guava、gson、tink、material…）。對照：play `releaseRuntimeClasspath` 有 158 行符合 | PASS | `fdroid-classpath-google-artifacts.txt` |
| C2 APK 內容 | dex 裡沒有 gms／mlkit／firebase／billing／expo-iap／expo-camera／expo-notifications／google-signin／openiap 的 class | 9854 個 class，0 個符合；`HybridMrzOcr`（stub）與 `HybridPasskeyPrf` 仍在（Nitro 依名稱註冊） | PASS | dexdump 輸出（本機，未入庫） |
| C3 啟動 | 歡迎畫面、logcat 沒有 FATAL | 歡迎畫面；`[solidarity:boot] show-app:boot-complete`；整段測試 logcat 0 個 `FATAL EXCEPTION`、0 次 "not part of the F-Droid build" | PASS | `c3-launch.png` |
| C4 身分步驟無 passkey | 標題 "Identity protection"、只有 "Create My Keys"；按下後進到 links 步驟 | 如預期；按下後進到 "Add Links" | PASS | `c4-2-identity-step.png`、`c4-4-ready.png` |
| C5 設定頁 | 沒有 Passkeys、Plan、Backup & Recovery；有 Recovery phrase | 如預期（UI dump：Username／Account Protection／Recovery phrase／Preferences／Data／Reset） | PASS | `c5-settings.png`、`c5-settings.xml` |
| C6 Page 頁 | 沒有 "Edit on your computer" | Attestations 之後就結束，該列不存在 | PASS | `c6-me.png`、`c6-me-bottom.png` |
| C7 設計控制解鎖 | 第 3 個之後的字體沒有 Pro 標記且可套用；自訂顏色可編輯；品牌開關可切；不跳付費牆 | Mincho（index 3）selected=true、預覽字體改變；Show creds.id 由 true→false；頁尾文字 "Built_on_F-Droid" 套用到預覽；自訂顏色 `#D6E8FF` 套用到預覽背景；全程沒出現付費牆 | PASS | `c7-2-text.png`、`c7-3-mincho.png`、`c7-5-footer-after.png`、`c7-6-custom-color.png` |
| C8 Pro 區塊解鎖 | 區塊列沒有 Pro 標記；加入後出現 toast，不跳付費牆 | Shop（`pro: true`）加入、toast "Added to your page"、Sections 1/6；點區塊進入 "Edit Section" 編輯畫面 | PASS | `c8-1-add-sheet.png`、`c8-2-shop-added.png`、`c8-4-shop-edit.png` |
| C9 沒有 QR 掃描入口 | Contacts 新增選單沒有 "Scan their QR"；Present 頁頂沒有掃描鈕 | 兩處都沒有 | PASS | `c9-people-add.png`、`c9-present.png` |
| C10 護照直接手動輸入 | 直接顯示資料表單，沒有 Scan 鈕、沒有 "back to scan" | 如預期（ReadyStep 的 "Get Your First Check" 進入） | PASS | `c10-passport.png` |
| C11 隱藏路由導回 | `credsid://settings/{pro,passkeys,backup}` 落在設定頁 | 從 Page 頁發送 `settings/pro` → 設定頁；passkeys／backup 在重啟後發送也都落在設定頁 | PASS | `c11-pro-before.png`、`c11-pro.png`、`c11-passkeys.png`、`c11-backup.png` |
| C12 play 建置 | 不設變數 `assembleRelease` 成功，輸出在無 flavor 路徑 | BUILD SUCCESSFUL；`apk/release/app-release.apk`（無 flavor 路徑）；dex 14665 個 class，含 billingclient 244、gms 26、mlkit 10、firebase 15、expo-camera 20、google-signin 3 個 → Play 依賴沒被動到。沒有安裝到裝置 | PASS | `build-play.txt`（本機） |
| C13 護照表單說明沒包掃描（22:00 重建的 APK） | 手動輸入表單頂端說明 F-Droid 版沒有相機掃描 | 顯示「Camera scanning isn't included in the F-Droid build — it needs Google's ML Kit…」；整段 logcat 0 個 `FATAL EXCEPTION` | PASS | `c13-passport-no-scan-note.png` |

整體：**PASS**（C1–C13 全部 PASS）。範圍外未驗證的項目列在下方。

Repo verify（建置完成後跑一次）：`bun run typecheck && bun run lint && bun run test` → typecheck 0 error、lint 0 error（178 warnings）、unit 1501 pass／0 fail、parity 73 pass／0 fail。

## 未驗證／不在這次範圍

- NFC 護照讀取（AVD 沒有 NFC）——fdroid 只拿掉 MRZ OCR，jmrtd 路徑沒改，但沒有實機跑過。
- 實機（非 AVD）跑 fdroid 版；去 Google 化手機（沒有 Play services）上跑。
- `fdroid build` / `fdroidserver scanner`、fastlane metadata、fdroiddata recipe。
- fdroid 版的 App Links（F-Droid 簽章憑證還沒加進 creds.id `assetlinks.json`）。
- iOS 沒有重新跑（iOS 一律 `store`，程式路徑不變；只跑了 typecheck／unit）。

## 偏差

- 第一次 `monkey` 啟動失敗（exit -5，工具問題），改用 `am start -n` 後正常；C3 截圖重拍。
- 第一次 fdroid 建置失敗：我在建置途中把 stub 從 `src/platform/` 移到 `plugins/`，Metro 找不到舊路徑；重跑後成功（這也證明 Metro 確實換上了 stub）。
- 測試期間 iPhone 18 Pro 模擬器（另一個 session 的）仍在開機狀態，所以短暫同時開了 AVD（限 2 GB RAM，當時記憶體 53% 空閒），測完已 `adb emu kill`。

## 遠端狀態與清理

- 沒有任何遠端寫入（全程離線）。
- AVD 上原本裝的是 10/31 的 debuggable vc29 開發版：測前先 `adb pull` APK 並 `run-as tar` 備份 app 資料，測完移除 fdroid 版、重裝 vc29 並還原資料。Android Keystore 裡的金鑰無法備份，若那個安裝有硬體金鑰，舊測試身分可能無法再解鎖。
- AVD 網路已恢復（飛航模式關、Wi-Fi／數據開），模擬器已關閉。
