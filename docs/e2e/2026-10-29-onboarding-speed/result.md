# 2026-10-29 onboarding 耗時實測 + Links 發佈改背景 + Face ID 說明動畫

iPhone 17e 模擬器（iOS 27），Debug dev client（DerivedData 19:27 build，nitro 0.37.1），Metro :8083，
全新安裝＋清空 keychain，語言 zh-Hant。用 idb 點擊、輪詢 accessibility tree 量「點下 → 下一個畫面出現」；
Links 內部用暫時的 `console.log` 標記（從 simulator log 讀，已移除）。Face ID 由腳本在提示出現時自動通過，
所以 Face ID 時間 ≈ 系統最短反應，不含真人看臉的時間。

正式環境寫入（Kidney 同意）：註冊了 `e2etiming1029`（改前）與 `e2etiming`（改後；idb 打字掉了尾碼）兩個名字，並發佈到公開 relay。

## 每一步耗時

| 步驟 | 改前 | 改後 |
|---|---|---|
| 冷啟動 → Welcome（dev，bundle 已快取） | 10.1 s（第一次 41 s，含 Metro 打包） | 22.5 s（剛重裝，含打包） |
| 開始 → 使用者名稱 | 0.8 s | 0.7 s |
| 打完名字 → 「可以使用」 | 1.3 s | 1.5 s |
| 使用這個名稱 → Passkey | 0.4 s | 0.5 s |
| 稍後再說 → Links | 4.6 s | 4.0 s |
| **從空白開始 → 一切就緒** | **38.4 s** | **≈ 5.5 s** |

### Links 這一步拆開（改前 38.4 s）

| 段落 | 時間 | 說明 |
|---|---|---|
| 簽 Page＋存檔（含 Face ID） | 12.6 s | dev 第一次跑還要從 Metro 拉 lazy bundle。暖機後在 Me › Edit 量同一條 `saveProfile`：getRootDid 1.55 s、getRootSigner 1.25 s、Face ID gate 0.65 s、Face ID 0.84 s |
| 發佈 Page＋kind-0 | 15.2 s | relay.damus.io kind-0 逾時 8.0 s，等全部 relay 回覆才往下走 |
| NIP-05 註冊 | 0.35 s | |
| 再發一次 kind-0（帶 nip05） | 9.1 s | damus 5.1 s |

### 改後

- 點下 → 簽完 4.5 s：說明畫面先顯示 0.45 s，之後才跳 Face ID（實際上 Face ID 約 3.5 s 後才出現）。
- 「已簽名」動畫 0.65 s 後就進到「一切就緒」；這時「你的頁面」顯示「正在發佈…」（`ready-publishing.png`）。
- 背景發佈在點下後 22.3 s 完成，列自動變成綠勾（`ready-published.png`）。這一輪的 relay 比較快：發佈 10.8 s、註冊 0.33 s、kind-0 6.7 s。

## 改了什麼

- `src/nip05/backgroundPublish.ts`：Page 發佈移出前景；結果寫進 Settings › Username 也在用的同一組 preferences。同時只會有一個發佈在跑。
- `LinksStep`：前景只做「簽 Page」這一件事（還原的身分如果還沒有 Nostr key，也在這裡先導出，讓背景發佈不會再跳 Face ID）。
- `ReadyStep`：「你的頁面」這一列有四種狀態：正在發佈 / 已上線 / 名字被搶（換一個）/ 失敗（再試一次）。
- `SignSeal`：簽名說明動畫。兩個 creds.id 環微開、緩慢擺動，右下角是 Face ID 徽章；簽完後雙環合上、輕壓一下（同開場動畫），徽章變成 ✓。放在畫面下半部，避免被系統的 Face ID 視窗蓋住（`sign-explainer.png`）。
- 文案：「用 Face ID 簽下你的頁面 / 金鑰只在這支手機上。這個簽名證明頁面是你本人發的，連 creds.id 也改不了。」

## 沒驗證到的

- Release build 的耗時（只量了 Debug；dev 的 lazy bundle 會把第一次簽名拉長）。
- Android；深色模式（模擬器切成 dark，App 仍是淺色，應該是 App 自己的外觀設定固定了）。
- 「名字被搶」與「發佈失敗 → 再試一次」兩種狀態：沒觸發到，只有看 code。
- 還原身分（沒有 Nostr key）時在前景導出金鑰的路徑。
- 發佈途中把 App 關掉：頁面會停在未發佈，要從 Settings › Username 重發（以前的轉圈畫面也是同樣的風險）。

## 量測時看到、還沒處理的

1. kind-0 發了兩次（`publishToNostr` 一次、`publishPublicPageName` 帶 nip05 再一次），白白多 7–9 s。
2. relay 發佈要等全部回覆，不是過半數就結束；一個慢的 relay 就會多拖 8 s。
3. `getRootDid` 和 `getRootSigner` 各自讀一次 mnemonic 再重新導出金鑰（dev 下各約 1.2 s），屬於 identity 路徑（L）。
4. Passkey「稍後再說」4–4.6 s 是 keychain／iCloud 依序執行；另一個 session 正在處理這條路徑，這次沒碰。
