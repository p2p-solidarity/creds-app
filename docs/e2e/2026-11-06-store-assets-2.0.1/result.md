# 結果 — 2026-11-06 2.0.1 商店截圖重拍＋Release 版跑一輪

Build：iPhone 18 Pro 模擬器（iOS 27），**Release** 模擬器版（`xcodebuild -configuration Release`，不是 dev client），2.0.1 @ `586a361e`。示範帳號 `creds.id/credsdesign`（舊金鑰隨模擬器被清掉；經 Kidney 同意刪 D1 舊列後重新註冊，新 pubkey `9182c7d5…`）。

| 案例 | 預期 | 實際 | 判定 |
|---|---|---|---|
| R1 onboarding 認領 credsdesign | 名稱可用、註冊成功 | `nostr.json?name=credsdesign` → `9182c7d5…` | PASS |
| R2 快速新增 4 條連結＋簡介、發布 | 網頁 creds.id/credsdesign 顯示同內容 | 瀏覽器讀到簡介＋GitHub/X/solidarity.gg/creds.id | PASS |
| R3 出示 tab | 不閃退；QR = `/@credsdesign` | 第一次**閃退**（`Cannot find native module 'ExpoNetwork'`，本機 Pods 沒跟上 expo-network）→ `pod install` 重編後正常；zbarimg 解出 `https://creds.id/@credsdesign` | PASS（本機環境問題，Xcode Cloud 每次 prebuild --clean + pod install） |
| R4 vCard 匯入 6 人＋存 @gimmy | 聯絡人一種列樣式、@gimmy | 同預期 | PASS |
| R5 App 更新後相簿頭貼 | 頭貼還在 | 修前：重裝（容器 UUID 換）後頭貼消失，從 2.0.0 就有的 bug（MMKV 存絕對路徑）→ 修 `586a361e`（只留檔名、接到目前 Documents）→ 容器 BD7A…→190D… 後頭貼正常 | PASS（修正後） |
| R6 英文介面 | 同畫面英文 | Page / Present / Contacts 英文正常 | PASS |

證據：`avatar-after-container-change.png`（gitignored）；商店圖在 `creds-marketing-assets@ed1c676`。

驗證：`bun run typecheck && bun run lint && bun run test` exit 0（lint 0 error；unit 1280、parity 54 pass）。

## 商店素材

- 重拍 iPhone 01 頁面、02 預覽、03 出示（creds night 卡）、04 聯絡人，中英各 4 張；重出 App Store 6.9″/6.3″、Play 手機/平板/主題圖。
- 第 5 張標題 `creds.id/@你` → `creds.id/你`；聯絡人放大框移到 `@gimmy` 那列。
- `store-copy/2.0.1.json`：描述裡的 `creds.id/@you` 改成 `creds.id/you`，新的「新功能」文案。

## 沒跑／沒換

- 「綠勾，訪客自己查」那張（`05-verified`）沒重拍：要 Kidney 自己有見證的頁面，模擬器沒有；畫面上「簽章有效」是 2.0.0 文案（現在叫「頁面內容沒被改過」），內容沒有錯但字不同。
- `06-add`（貼上連結）沒重拍，畫面沒改版。
- iPad 13″ 4 張沒重拍（仍是 2.0.0 畫面，網址帶 @）。
- 沒有上傳到 App Store Connect / Play Console；沒跑實機、Android、深色模式。
