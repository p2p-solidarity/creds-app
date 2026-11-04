# 結果：程式碼清理（docs/ref/14）E2E — 2026-11-04

## 範圍與建置

- 分支 `claude/code-cleanup-14-af2e3a`。commit：`d1ae9b4c`（§1 死碼）、`01e719e7`（⚠ 安全路徑 export）、`76ad0aeb`（§2 legacyWipe）、`cdd965ea`＋`3cdbaa4f`（§4 改名＋小項目）、`c308537f`（§3 註解）、`032d3f0c`（review 修正）、`6fb20a15`（§8 移除 Pear／bare-kit）、licenses 重產。
- iOS：`iPhone 18 Pro` 模擬器（iOS 27.2）。Debug dev client 從這個 worktree 建置，Metro 跑在 :8082（同一個 worktree）。
- Android：既有 AVD `aniseekr_test`（API 36）。`bundleRelease` 只建 arm64-v8a，從這個 worktree 建置。worktree 裡沒有 release keystore，所以 APK 用模板 debug key（SHA-1 5E:8F:16…）簽，跟 AVD 上原本那份一樣，直接蓋過去安裝、保留資料。
- Harness：臨時的 `src/e2eLegacyProbe.ts` 和 `app/e2e-social.tsx`，沒有 commit，跑完就刪了。它會寫測試資料、把 `[e2e-legacy]` 快照記到 Documents/e2e-legacy.log，並略過 onboarding（理由見「偏離」）。

## 判定表

| Case | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| C1 iOS 冷啟動（新安裝） | onboarding 出現，boot log 走到 `show-app` | onboarding 出現，`show-app:boot-complete`，沒有 redbox。新安裝時開機清除也成功（marker `"1"`） | PASS | `C1-ios-cold-start.png`、`C1-probe-fresh-install.log` |
| C2 需要 Face ID 的設定動作 | 清除所有資料會跳出 Face ID | 跳出 Face ID（`rotateMasterKey`，紅線），配對成功後才繼續 | PASS | `C2-faceid-prompt-wipe.png` |
| C3 寫入舊資料 | 5 個舊 MMKV key＋vault／sakura／wrapKeyV2／Semaphore identity／nullifier 都存在 | 全部存在 | PASS | `C3-seed.log` |
| C4 設定頁清除 | 跳出完成提示並回到 onboarding；重開後舊 key 和 alias 全部不在 | 回到 onboarding；`legacyMmkv: []`，所有 secret 都是 `false`，wrapKeyV2 回 404 | PASS | `C4-wipe-done.png`、`C4-after-wipe-probe.log` |
| C5 開機時的 `runLegacyWipeOnce` | before：全部存在、marker null；4 秒後：全部不在、marker `"1"` | 與預期相同 | PASS | `C5-boot-cleanup.log` |
| C6 社群驗證面板（改名後） | 面板開得起來，畫面上沒有 raw `zktls.` 或 `socialProof.` key | 顯示 GitHub 目標列、「請先領取你的 creds.id 名稱…」和「領取你的名稱」，都是 `socialProof.*` 翻譯後的文字。locale 裡 `zktls.` 有 0 個 key、`socialProof.` 有 39 個 | PASS | `C6-social-verify-panel.png` |
| C7 Android 冷啟動 | （併入 C9，用移除 Pear 之後的 release build） | — | — | — |
| C8 Android 大小（§8） | arm64 下載明顯低於 68.35 MB；AAB 裡沒有 `libbare-kit.so` | `bundletool get-size total --dimensions=ABI`：arm64-v8a 為 **49.58 MB**（MIN 49,581,926 B），少了 18.8 MB；`.so` 清單裡沒有 bare-kit，最大的是 `libsemaphore_bindings.so` 20 MB | PASS | bundletool 輸出（本文） |
| C9 Android 冷啟動＋已存 Page（§8） | 走到 `show-app:boot-complete`，沒有 FATAL／UnsatisfiedLink；已存 Page 的詳細頁正常 | release APK 冷啟動走到 boot-complete，logcat 裡 FATAL／UnsatisfiedLink／dlopen 都是 0。用 App Link `https://creds.id/@gimmy` 解析後存入 People，「View in Contacts」打開 `people/profile/[did]`：Page、「Page signature valid」、「Add phone, email or note」都正常，捲到底也沒有 Pear 區塊 | PASS | `C9-android-cold-start.png`、`C9-android-saved-page.png`、`C9-android-saved-page-bottom.png`、`C9-android-boot.log` |
| C10 iOS 大小（§8） | `.app` 明顯低於 128 MB；沒有 `BareKit.framework` | Release archive（generic iOS，沒有簽章）的 `.app` 為 **92 MB**，Payload 壓縮後 38 MB（之前約 50 MB）。`Frameworks/` 裡沒有 BareKit | PASS | `du -sh` 輸出（本文） |
| C11 iOS 冷啟動＋已存 Page（§8） | Release 模擬器版冷啟動；已存 Page 的詳細頁正常 | 冷啟動 PASS，onboarding 第 1 頁正常。已存 Page 這一步沒做：Release 版沒辦法略過 onboarding，走完會在正式環境註冊 NIP-05 | 冷啟動 PASS／已存 Page UNVERIFIED | `C11-ios-release-cold-start.png` |

驗證指令：移除 Pear 之後跑 `bun run typecheck && bun run lint && bun run test`，結果 typecheck 0 錯誤、lint 0 errors（163 個 warning 是原本就有的）、unit 1235 pass、parity 54 pass。unit 從 1398 降到 1235，是因為刪了 11 支 `pear*.test.ts` 和其他測試裡的 Pear 案例。

## 偏離

- 階段 2 的 E2E（C1/C2）是在階段 2＋3 合併後的樹上跑的，沒有單獨跑一次階段 2。
- onboarding 由 harness 略過（設定 `hasCompletedOnboarding`、`developerMode`）。真的走完 onboarding 會在正式的 creds.id 註冊一個收不回來的 NIP-05 名稱。
- C6 用臨時路由直接 render `SocialVerifyPanel`。Me 頁要先有已建立的身分和 Page，而建立 Page 會發佈到 Nostr，所以 Me → 新增連結這條路沒有走。
- iOS 模擬器第一次 launch 回「system shell probably crashed」，重開模擬器後就正常，判斷是模擬器本身的問題，不是 app crash（沒有新的 crash report）。
- 遠端狀態：沒有改任何遠端資料。AVD 上那份 app（parent session 的資料）在 People 裡多了一筆 `@gimmy` 的本機 snapshot。

## 行為變更（刻意的）

- 舊 QR 的 Semaphore issuer proof 不會再把卡片升為 Verified，群組已退役。proof 有效顯示 Unverified，無效顯示 Failed。
- 開機時跑一次 `legacyWipe`，刪掉 groups／sharing／vault／Semaphore／passport anchor／Shoutouts 留下的資料。設定頁的清除所有資料也走同一個函式。
- review 修正：本機清除會先等開機那一輪清除跑完，避免 marker 在 MMKV 清空後才寫入，讓 rekey 失敗。

## code review（安全路徑，沒有實測）

`/code-review high` 跑在 `da96ae9c..76ad0aeb`，共 6 項：
- 修了：開機清除和本機清除的競態；`nativeBridge` 裡沒人用的 test seam。
- 沒修：被刪的 `zkIdentityDeletion.test` 原本保護的 fail-closed，現在沒有測試。要補，得 mock `@solidarity/nitro-keystone`／`expo-secure-store`，而 bun 的 `mock.module` 是整個 process 共用的，會影響其他測試。
- 沒修：`legacyData` 一個 target 包了四個儲存區，失敗時看不出是哪一個。
- 沒修：`runLegacyWipeOnce` 吞掉錯誤。
- 不用改：SNARK 驗證只用來分 Failed 和 Unverified，這是 Kidney 選「只留驗證」的代價。

## §8 補充

- 保持不動：Android `minSdkVersion` 29（已上架，不往下降）；`expo-build-properties` 的 `useLegacyPackaging: true`（拿掉 bare-kit 後要不要改回 false，另外決定）。
- `../airmeishi-web` 沒有改，只回報：
  - `public/.well-known/apple-app-site-association` 還有 `"/pear/*"`。
  - `docs/LEGAL_SOURCES.md` 和 `docs/ref/05-plan-web-viewer.md` 還提到 Pear。
  - 隱私權政策（`src/content/legal/`，app 的 `legal/documents.ts` 是從這裡產生的）還有「Private card exchange … peer-to-peer network」那一段，要在 web 端改了再重新匯出。
- OIDC 的 card-key binding（`presenter.ts` 的 `cardKeyBinding`、`proofVerifier.ts` 的 `expectedRootDid`）只有 Pear 在用，現在沒有呼叫端了。這次只改註解，程式還在，可以另外決定要不要刪。
- `apps/expo/ios/Solidarity.xcodeproj/project.pbxproj` 是 pod install 產生的狀態，沒有 commit。Xcode Cloud 會用 `--clean` prebuild 重新產生。

## 沒有跑的

- 實機。App Attest 和見證相關的路徑在模擬器上沒有。
- Android release／AAB 和 F-Droid flavor。
- iOS archive。
