# 結果 — 刪除帳號拿掉舊版收件匣步驟（2.0.1）

範圍與 build：iPhone 18 Pro 模擬器（`793562A3`），Debug dev client 由 `2.0.1` 工作樹建置（`expo run:ios`），Metro :8081 同一棵樹。身分用 UX 測試留下、本來就會被清掉的 `uxtest1104`（名稱沒註冊，`nostr.json` 測前就是 `{}`；0 把 passkey、備份關閉，見 `00-baseline-settings.jpg`）。同日 `airmeishi-backend` 已換成 stub（backend `62ac70b`）。

| 案例 | 預期 | 實際 | 判定 | 證據 |
| --- | --- | --- | --- | --- |
| P0 bundle 含本次修改 | 沒有 `inbox/delete`、沒有 worker 網址；`/pro/binding` 在 | `inbox/delete` 0、`deleteAccount.step.inbox` 0、`retired Shoutouts inbox` 0；`airmeishi-backend` 2 處都是註解（repo 名），沒有網址；`/pro/binding` 2；步驟陣列 `'nostr','name','vault','pro','local'` 1 | PASS | Metro 給 iOS 的完整 bundle（21.4 MB）grep |
| C1 步驟列表 | 5 列，沒有「舊版收件匣」 | 公開頁面／名稱／線上備份／Pro 連結／這支手機 | PASS | `02-progress-five-steps.jpg` |
| C2 刪除跑完 | 「帳號已刪除」並回到 onboarding | 一次 Face ID（模擬）後全部完成，跳「帳號已刪除」，背後是 onboarding | PASS | `01-delete-screen.jpg`、`03-deleted.jpg` |
| C3 隱私權政策 §14 | 沒有 Shoutouts 那條，Pro 之後接清除手機 | 名稱 → root vault → Pro → 最後清除手機 | PASS | `04-privacy-s14.jpg` |

補充（不是區分性證據）：Cloudflare analytics `airmeishi-backend` 在 00:40–01:15 UTC 只有 00:41 的 7 次，對得上我手動 curl 的 7 個探測；刪除執行的 01:09–01:11 是 0 次。全新身分本來就沒有舊 key，舊程式也不會打，所以真正的證據是 P0。

## 沒跑到

- 手機上還留著 1.3.x Shoutouts key 的情境（要從舊版升級到 2.0.1）。程式裡已經沒有這一步，key 由「這支手機」那步的本機清除刪掉（`productionWipe.ts` `LEGACY_RECIPIENT_KEY_ALIASES`）。
- Android。
- 第一次按「刪除」時模擬 Face ID 沒對上時機，gate 回失敗、畫面安靜回到初始狀態（既有行為，不是這次的修改）；第二次連送 match 才進去。
- creds.id/privacy 網頁版要等 airmeishi-web 部署後才會少掉那條。

## 環境插曲

- 第一次 build 完成那一刻剛好遇到每小時清理（09:56 JST）把 DerivedData 刪掉，安裝失敗；磁碟只剩 1.4 GB 時模擬器卡住，刪掉本次 build 的 DerivedData、重開模擬器後正常。
- 跑完已 `simctl shutdown all`、停掉 Metro。

## 遠端狀態變更

- `uxtest1104` 的 Nostr 記錄、名稱步驟、vault、Pro 步驟都由 app 刪除流程處理（測試身分，原本就預計丟棄）。
