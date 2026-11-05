# 結果 — 2026-11-04 UX 細節（branch 2.0.1，未 commit 時跑）

範圍與 build：iOS dev client 由 `2.0.1` + 本次修改建置（`expo run:ios`，iPhone 18 Pro 793562A3，Metro :8081），全新安裝、新身分 `uxtest1104`（只存在模擬器本機）。計畫見 `plan.md`。

**整體判定：PASS（計畫內 10 項全 PASS）；計畫外標為不能跑的項目見下。**

## 判定表

| 案例 | 預期 | 實際 | 判定 | 證據 |
|---|---|---|---|---|
| U1 區塊項目網址 | 錯網址欄位下方紅字、儲存不能按 | 項目標題空白 →「這個項目需要標題…」；`mailto:me` →「請輸入 https:// 開頭的網址。」；儲存 `enabled:false`（idb） | PASS | `U1-inline-errors-save-disabled.png`、`U3-discard-dialog-and-U1-url-error.png` |
| U2 刪除區塊確認 | 確認框；取消後區塊還在 | 「移除「作品集」？」；按取消後仍在編輯區塊 | PASS | `U2-remove-section-confirm.png` |
| U3 取消時的捨棄確認 | 有改動按取消 →「要捨棄變更嗎？」 | 出現（第一下取消只收鍵盤，第二下出現對話框）；捨棄後回頁面 | PASS | `U3-discard-dialog-and-U1-url-error.png` |
| U4 文字區塊 | 只有「內容」一格，打字即時預覽 | 無項目標題/連結/樣式；預覽即時顯示 `Hello`；儲存成功 | PASS | `U4-text-section-live.png` |
| U5 一顆發布按鈕 | 只剩「發布頁面變更」 | 無卡片、無說明文字，只有按鈕 | PASS | `U5-one-button-publish.png` |
| U6 移除連結確認 | 「要移除「…」嗎？」 | 「要移除「@octocat」嗎？」 | PASS | `U6-remove-link-confirm-before-cancel-fix.png` |
| U7 開關主題 | 品牌紫、縮小、淺/深色都對 | 淺色 OK；深色原本 thumb 是深色（像破洞）→ 改白色後重看 OK | PASS | `U7-preferences-light.png`、`U7-preferences-dark.png` |
| U8 我已經有帳號 | 三顆按鈕、沒有說明段落 | 三顆按鈕；順手修掉標題上方的空白帶 | PASS | `U8-existing-account-before-inset.png`、`U8-existing-account.png` |
| U9 找不到證明 | 有返回 | 標題列返回 +「返回」按鈕，點了回到上一頁 | PASS | `U9-proof-not-found.png` |
| U10 creds.id/edit | 不再是 Unmatched Route | 線上 AASA 仍是全路徑 → 進 App → 新的 fallback 用 App 內瀏覽器開 creds.id/edit | PASS | `U10-edit-link-in-app-browser.png` |

## 跑測中發現並當場修掉的

- 確認框的取消鍵顯示英文「Cancel」：`confirmDialog` 預設值寫死英文。改成翻譯字串，U2 截圖已是「取消」。
- 開關在深色模式 thumb 用卡片色（近黑）。改成白色。
- 「我已經有帳號」sheet 標題上方一大段空白（在 sheet 外讀 safe area）。改用 `sheetTopInset`。
- 中文「發佈」「發布」混用 → 全部「發布」。

## 不能在這裡跑的（計畫時就標記）

- 出示卡線上/離線、卡下方「領取你的名稱」提示：要先發布頁面（寫 relay）。UNVERIFIABLE。
- 證明隱藏確認 / 重新公開：要掃護照（NFC）。BLOCKED。
- 聯絡人「頁面」列的淡紫底色：要先存一個別人的頁面。沒有測試資料，未驗證。
- 發布卡「blocked」狀態（指出哪個區塊/連結有問題）：區塊編輯器現在擋掉錯網址，UI 上做不出壞草稿；只有舊資料才會觸發。邏輯是 schema 本身，未在 UI 看到。
- AASA 收窄：要部署 web 並等 Apple CDN 更新；Android App Links 要實機。

## 遠端狀態與偏差

- 沒有發布、沒有註冊名稱：跑測期間把 `src/nip05/backgroundPublish.ts` 暫時改成不送出（偏差，已還原，`git diff` 確認無殘留）。onboarding 的 passkey 選「稍後再說」。
- 模擬器跑完會關機，每小時清理會清掉這個身分。
