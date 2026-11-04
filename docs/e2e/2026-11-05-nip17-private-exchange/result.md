# E2E result — NIP-17 護照私密出示（docs/ref/16 P1）

> 2026-11-05 · branch `claude/nip17-private-exchange-c25c08` · 計畫見 `plan.md`

## 範圍與 build
- App：已安裝的 Release `.app` 2.0.1 (1)（原生層 = 本分支），`main.jsbundle` 換成本分支 `expo export:embed --bytecode` 產物；C7 修正後重新匯出，兩台都 `cmp` 確認是同一份 bundle。
- A（請求者）= iPhone 18 Pro 模擬器；B（持有人）= iPhone 18 Pro Max 模擬器。一次只開一台。
- 身分：兩組拋棄式 24 字復原字詞（只在 scratchpad），用「我已經有帳號 → 輸入復原字詞」還原，**跳過選 creds.id 名稱，沒有註冊任何 NIP-05**；Page 用開發者選項的「Nostr 發布」發到 nos.lol / relay.primal.net / relay.damus.io。
- 獨立驗證：scratchpad 的 bun 腳本直接對中繼站下 REQ（kind 30078 / 10050 / 1059 `#p`），不經過 App。

## 結果
| ID | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| C0 | 測的是本分支 JS | B 的個人頁有「私下請求／請求護照資料」 | PASS | `C0-a-person-page-section.png` |
| C1 | 兩個 Page 在 relay | A、B 的 kind 30078 在三個 relay 都查得到（damus 偶爾不回 EOSE） | PASS | relay 腳本輸出 |
| C2 | B 發佈 10050 | B 開私密請求頁後，10050 = `["wss://nos.lol","wss://relay.primal.net"]`，三個 relay 都有 | PASS | relay 腳本、`C2-b-inbox-empty.png` |
| C3 | B 有開發模式護照，只有國籍 | 模擬 NFC 存檔成功；同意畫面上國籍可選、姓名「你沒有這項」 | PASS | `C6-b-consent.png`（MMKV 有加密，改由畫面驗） |
| C4 | A 存 B 的 Page | 開 `https://creds.id/#nostr:<B npub>` → 簽章有效 → 存入聯絡人；People 有 E2E Holder | PASS | `C4-a-people-has-b.png` |
| C5 | A 寄出請求 | 姓名＋國籍 → 「等待回覆 · 2026/11/12 過期」；p-tag B 的 1059：nos.lol 0→1、primal 0→1、damus 0（不在 B 的 10050，本來就不寄）；外層 pubkey ≠ A、只有 `p` tag、created_at 往前 4.4 h | PASS | `C5-a-request-form.png`、`C5-a-waiting.png`、relay 腳本 |
| C6 | 誠實的同意畫面 | 「1 則私密請求」→ E2E Asker + `did:key:zDnaeVen…AsPgTk` · 不在你的 People、「名字是對方自己填在 Page 上的」、姓名「你沒有這項」（不能選）、國籍預選、「無法證明是真機…未經真機檢查」、中繼站隱私說明 | PASS | `C6-b-people-row.png`、`C6-b-inbox.png`、`C6-b-consent.png` |
| C7 | Face ID 失敗什麼都不送 | 第一次：p-tag A 的 1059 維持 0（PASS），但畫面**沒有任何提示**（FAIL，見下）。修正後重跑：「沒有通過 Face ID，什麼都沒送出。」顯示在按鈕上方，A 的 1059 仍為 0 | PASS（第二次） | `C7-b-faceid-failed-passcode.png`、`C7-b-denied-inline.png`、relay 腳本 |
| C8 | B 同意並回覆 | Face ID 通過 → toast「已寄出；對方會看到「未經真機檢查」」，收件匣清空；p-tag A 的 1059：nos.lol 0→1、primal 0→1，外層 pubkey ≠ B | PASS | `C8-b-sent-toast.png`、relay 腳本 |
| C9 | A 驗證並照實顯示等級 | 「E2E Holder 私下出示了 · 護照上的國籍 TWN · 開發模式護照，未經真機檢查 · 這支手機在 2026/11/05 1:52:52 驗過」；沒有姓名（沒給就沒有） | PASS | `C9-a-verified-answer.png` |

| R1 | 晚讀的回覆照收（code review 修正後） | A 02:01 再請求（只要國籍）→ B 約 02:05:30 Face ID 送出 → 兩台都關、等 5 分半 → A 02:12:37 驗過並顯示「E2E Holder 私下出示了 · 國籍 TWN · 開發模式護照，未經真機檢查」。修正前這種「簽完超過 5 分鐘才讀」會被當 notCurrent 默默丟掉 | PASS | `R1-a-second-request.png`、`R1-a-late-answer-verified.png` |

整體：**PASS**（C7 第一次 FAIL，修正後在含修正的 bundle 上重跑 PASS；R1 在含 code review 修正的 bundle 上跑）。

## 失敗與修正
- **C7 第一次 FAIL**：`PassportConsentSheet` 失敗時用 `pushToast`，但 toast overlay 在 root layout，畫在原生 formSheet **下面** → 持有人按了送出、Face ID 失敗後畫面只是回到原狀，不知道有沒有送出。修正：兩個 sheet（同意、請求表單）的失敗訊息改成 sheet 內的 inline 文字（成功仍是先關 sheet 再 toast，看得到）。

- **Code review（`/code-review high`）**：出示驗證原本要求 `signedAt` 在「現在」±5 分鐘，但 NIP-17 是非同步的，請求者晚開 App 就收不到回覆——改成「簽在請求開著的期間」（tdd，`packages/shared/test/passportPresentation.test.ts`），並由 R1 實測。同一輪也修了：轉不到 DID 的暫時失敗不再標成已讀、relay 回滿 500 筆時不推進游標、自己的 10050 快取依 npub、刪帳號時 10050 盲讀就停、能做裝置證明的手機簽不出時不送（不默默降成 L1）。

## 執行時的偏差
- Face ID 故意失敗兩次後，模擬器的 Face ID 進入鎖定，之後每次都直接跳密碼畫面；用 `BiometricKit.enrollmentChanged` 0→1 重設後才通過。屬模擬器狀態，不是 App 行為；重設後 B 的金鑰與簽名都正常（C8 成功送出）。
- 開發者模式要點「版本」5 次；第一次點錯位置開到重新播放引導流程，關掉重來，未影響資料。

## 中繼站上留下的東西（拋棄式測試身分，不清除）
- A、B 各一個 kind 30078 Page、一個 kind 10050；B 收到 1 個 1059、A 收到 1 個 1059。沒有 NIP-05 名稱。

## Not run
- L3（App Attest / Android Key Attestation 真機簽名）：模擬器沒有，需要 TestFlight 實機兩台。
- Android、網頁（v1 不做網頁）。
- 請求 7 天過期路徑、拒絕後對方看到過期。
- relay.damus.io 需要 NIP-42 AUTH 才肯回 1059，目前不在 `DM_RELAYS`，AUTH 是後續工作。

## 順便發現（code reading + 這次操作碰到，不在本次範圍）
- **護照到期日 2030 年以後被判定為過期**：`validateMrzDraft`（`apps/expo/src/passport/pipeline.ts`）與 `fromMrzYyMmDd`（`PassportMrzStep.tsx`）都用出生日的世紀規則（YY≥30 → 19xx），所以到期 2030–2039 的護照手動輸入時顯示 1930 並報「Passport appears to be expired.」。本次改用 2029/12/31 繞過。
- 全 App 的 toast 都畫在原生 Modal 下面；其他 sheet 裡的 `pushToast` 失敗訊息也可能看不到（本次只修了私密交換的兩個 sheet）。
