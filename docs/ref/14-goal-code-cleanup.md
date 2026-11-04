# 14 — Goal：死碼、凍結子系統、註解與測試清理

> 2026-11-04 · 狀態：**goal 已定，尚未動 code**。來源：同日的 review（knip production 模式＋人工確認），文件清理（E）已在 `69321d85`、`f7da02dc`、`5edde8f9`、`06de0d89` 完成。
> 範圍：`apps/expo/src`、`apps/expo/app`、`apps/expo/__tests__`、`nitro-modules/{attest,keystone}`、`packages/shared`。
> 含安全路徑（keychain／identity／vault／passport／witness），整份屬於 **L**：分階段做，每階段結尾跑一次真的 E2E，最後 `/code-review`。

## 0. 目標（做完的樣子）

1. 正式 App 用不到的檔案、函式、只測死碼的測試全部刪掉。knip production 模式（設定見 §6）**沒有未使用檔案**；剩下的未使用 export 每一個都說得出理由（例如測試要用）。
2. 已凍結的 `groups/`、`sharing/`、`vault/`，以及 `zk/` 的身分、nullifier、passport anchor 儲存，換成一個 `legacyWipe`：直接刪掉舊資料的 MMKV key 和 keychain alias。子系統本身移除。
3. **Code is law, not comment.** 註解只留程式碼本身說不出的「為什麼」：安全不變式、平台陷阱（Nitro ArrayBuffer、worklet runtime）、刻意的非直覺選擇。歷史敘事、移植來源、計畫章節引用、改了什麼的 changelog 都刪掉。
4. 名字不再誤導：`zktls` 改名（裡面已經沒有 zk 了）。
5. `bun run typecheck && bun run lint && bun run test` 綠燈；iOS 模擬器和 Android 各跑一次冷啟動，加上「清除所有資料」流程，證據寫在 `docs/e2e/<date>-code-cleanup/result.md`。

## 1. 已知的死碼（review 結果，動手前再用 knip 確認一次）

### 1.1 正式路徑沒人 import 的檔案（12 個）
- `src/components/ocr/`（5 個檔案：`OcrScannerComponents.tsx`、`OcrScannerSections.tsx`、`index.ts`、`ocrAnalyser.ts`、`scanLanguage.ts`）
- `src/components/passport/BulletGuaranteeRow.tsx`、`src/components/cards/index.ts`、`src/sharing/index.ts`
- 只有測試在用：`src/passport/mrzOcr.ts`（`mrzOcr.test`）、`src/oidc/requestQr.ts`（`oidcRequestQr.test`）、`src/onboarding/steps/backupStepLogic.ts`（`backupStepLogic.test`、`backupStepPhraseImport.test`）、`src/onboarding/steps/secureKeysStepLogic.ts`（`secureKeysSyncWait.test`）

### 1.2 只出現在定義那一行的 export（73 個）
`[tN]` 是有 N 支測試引用它；這些測試要一起刪或改寫。帶 ⚠ 的在安全路徑。

- `src/atproto/connect.ts`: `disconnectAtproto`[t1]
- `src/cards/animals.ts`: `ANIMAL_CASES`, `animalDisplayName`, `animalPersonality`, `animalSymbolFallback`
- `src/cards/cardManager.ts`: `useMyCard`
- `src/cards/nostrPointerClaim.ts`: `buildNostrPointerClaimFromCache`
- `src/cards/qrCodeManager.ts`: `parseQrPayload`
- `src/cards/solidarityQrPayload.ts`: `buildSolidarityQrPayloadAsync`
- `src/cards/solidarityQrTypes.ts`: `shareFieldPreferencesFromFields`
- `src/components/common/imageProvider.ts`: `resolveImage`, `clearCache`
- `src/components/me/meProfileModel.ts`: `profileIdentityLine`[t1], `selectProfileShareUrl`[t1]
- `src/components/me/pageRowStyles.ts`: `BLOCK_ROW_STRIDE`
- `src/components/people/personDetailSupport.tsx`: `PersonDetailBubble`
- `src/components/verify/SocialVerifyPanel.tsx`: `parseSocialTarget`
- `src/contacts/importer.ts`: `importFromDevicePicker`
- `src/contacts/leaveCardInbox.ts`: `enqueueLeaveCard`[t1]
- `src/contacts/repository.ts`: `useContactListDetail`
- `src/credentials/issuerStore.ts`: `getIssuer`
- `src/credentials/presentationProof.ts`: `isPresentationDisabled`[t1], `presentedClaimIds`
- `src/credentials/store.ts`: `useCredentialManifestById`
- `src/credentials/trustAnchor.ts`: `allTrustAnchors`
- `src/groups/store.ts`: `useGroup`, `useGroupMembers`, `usePublicGroups`, `usePrivateOwnedGroups`, `usePrivateSharedGroups`, `canIssueCredentials`
- `src/identity/dataStore.ts`: `useHasClaim`
- `src/identity/issuerTrustAnchor.ts`: `useTrustAnchors`
- ⚠ `src/identity/rootKey.ts`: `deleteRootKey`[t3]
- `src/identity/verifiedClaimIndex.ts`: `isFieldVerifiedForHolder`, `verifiedFieldsFromCredentials`
- ⚠ `src/keychain/biometric.ts`: `isBiometricGraceEnabled`[t1]
- ⚠ `src/keychain/biometricGatekeeper.ts`: `requireSensitiveActionBoolean`
- ⚠ `src/keychain/sensitiveActionPolicy.ts`: `OPTIONAL_ACTIONS`[t1]
- ⚠ `src/keychain/signingKey.ts`: `listSyncableSigningKeys`[t4], `resolveSigningKeyConflict`[t4]
- `src/nostr/connectWizard.ts`: `classifyNostrPublishOutcome`, `isNostrPublishClassificationLive`
- `src/nostr/dagNode.ts`: `KIND_DAG_SYNC`, `signNode`[t2], `verifyNode`[t2]（DAG 同步已停用，`dagNode.test` 與 `nostrAdapter.test` 的 DAG 部分一起刪）
- `src/nostr/nostrAdapter.ts`: `dagNodeToNostrEvent`[t1], `buildHeadPointerEvent`[t1]
- `src/oidc/nonceStore.ts`: `getOIDCNonceStore`
- `src/onboarding/badgeVerification.ts`: `verifyOnboardingBadge`[t1], `badgeResultMatchesProfile`[t1]（`onboardingBadgeVerification.test` 只測死碼）
- `src/onboarding/passportHandoff.ts`: `subscribePassportOnboardingCompleted`
- `src/onboarding/publicPageUsername.ts`: `publicPageUrl`
- `src/page/richMedia.ts`: `isYoutubeVideoId`, `isYoutubeChannelId`, `mediaKey`
- ⚠ `src/passport/presentationClaims.ts`: `filterAvailablePassportPresentationClaims`[t1], `selectPassportShowPresentationClaims`[t1], `passportShowSelectedClaimTypes`
- `src/people/profileSnapshots.ts`: `getDeclaredSnapshot`[t1]
- `src/sharing/scopeResolver.ts`: `resolveEffectiveFields`, `resolveEffectiveFlags`[t1]（`shareScopeResolver.test` 629 行，跟 §2 一起走）
- `src/storage/storageManager.ts`: `hasAnyBusinessCard`, `hasAnyContact`, `getStorageSize`
- ⚠ `src/vault/secretsKeychain.ts`: `evictCachedRootSecret`[t1]
- `src/websign/transport.ts`: `WEBSIGN_RESPONSE_PARAM`
- `src/zk/coordinator.ts`: `useProofsSupported`
- `src/zk/fieldEncoding.ts`: `littleEndian32ToDecimalString`[t2]
- `src/zk/groupManager.ts`: `leafIndex`[t1]
- `src/zk/identity.ts`: `SEMAPHORE_IDENTITY_KEYCHAIN_ALIAS`
- `src/zk/passportAnchorStore.ts`: `listAnchors`, `getPassportAnchorCommitment`

另有約 140 個「export 了但只在檔內用」的符號，大多是刻意開給測試的介面。不在本次範圍，除非順手確認是死的。

## 2. `legacyWipe`：換掉凍結子系統

現況：`groups/`（420 行）、`sharing/`（994 行）、`vault/`（512 行）、`zk/`（1,344 行）在正式路徑上只剩三種用途：
- `src/settings/productionWipe.ts`：清除所有資料時，呼叫各 store 的 reset／delete
- `app/_layout.tsx`：啟動時 `useGroupStore.hydrate()`、`seedFromManifest()`、`GROUPS_MANIFEST_SCOPE`
- `src/components/settings/SettingsResetSection.tsx`：`zk/passportAnchorStore.clearAll`

做法：
1. 從各 store 列出它們實際寫入的 MMKV key、manifest scope、keychain alias（vault root secret、Semaphore identity 等），寫成 `src/settings/legacyWipe.ts` 裡的常數。註解寫明「舊版資料，只刪不讀」。
2. `legacyWipe()` 直接刪掉這些 key 和 alias，結果走 tagged union（安全路徑規則：不 throw、不吞錯、不 log PII）。
3. `productionWipe`、`_layout`、`SettingsResetSection` 改呼叫它；啟動時不再 hydrate groups。
4. 刪掉 `groups/`、`sharing/`、`vault/`，以及 `zk/` 裡只為這些服務的檔案和對應測試。parity 測試吃的是凍結的 golden vector：測試可以刪，`packages/parity-fixtures/` **不准動**。

**要先問 Kidney 的決定（不要自己選）**：`src/scan/envelopeHandler.ts` 驗證舊版 QR envelope 時，還會動態 import `zk/groupManager`（`verifyGroupProof`）和 `zk/proofManager`。這條路徑和 Nitro `Semaphore`（14 個方法、`libsemaphore_bindings` 每個 Android ABI 約 20 MB、iOS xcframework）綁在一起。
- 選項 a：保留 verify-only 的 `zk/groupManager`＋`proofManager`，等 P4（10 §4）移除舊 wire 時再一起拔。
- 選項 b：現在就讓舊 Semaphore envelope 顯示「舊版格式，請對方更新」，一起移除 Semaphore（JS、Nitro spec、原生 binding、xcframework、rust）。App 會再小一截，但屬於產品決定。

## 3. 註解精簡（code is law）

全樹註解約 17.7k 行，佔 ~10 萬行的 18%。規則：

- **刪**：
  - 「port of …swift」、`Color.Theme.*` 對照等 Swift 時代的說法（45 個檔案）
  - 引用已刪文件的句子：`docs/ref/01–04`、`06`、`notes-*`、`docs/archive`、`04-plan-app`、1.3.x（約 32 個檔案，用 `git grep -nE "docs/ref/0[1-46]|notes-|docs/archive|1\.3\.[0-9]"` 找）
  - 已退役的 openac／noir／passport-zk 敘述，例如 `pear/presentBuilder.ts`、`nitro-modules/attest/src/index.ts`、`HybridSemaphore.swift`
  - 「之前是…現在改成…」這類 changelog 式敘事
  - 只是重述函式名稱的 JSDoc
- **留**：
  - 安全不變式（例如 `ALWAYS_PROMPT_ACTIONS` 不能加 grace、owner 不能自己見證）
  - Nitro ArrayBuffer 非擁有權規則
  - worklet／async-runner 規則
  - 非直覺的平台 workaround，連同「為什麼」
  - 產生的檔案（`legal/documents.ts`、`legal/licenses.json`、`nitro-modules/*/nitrogen/`、uniffi 生成的 `semaphore_bindings.kt`）**不動**
- 不改行為：這一步只動註解，diff 只能是註解行和空白。

## 4. 其他壞味道

- **`zktls` 改名**（建議用 `socialProof`）：
  - App 端 `apps/expo/src/zktls/`
  - shared 端 `packages/shared/src/zktls/`；改了 shared 要升版號，web 端是 vendor 進去的
  - i18n 的 `zktls.*` key（en／zh-Hant 各 39 個）
  - **持久化的 key 不准改**：`zktls:proofs:v1`（`store.ts` 的 `LEGACY_KEY`）等已經寫進使用者裝置的名字，要保留原字串，或者寫 migration。
- `src/onboarding/steps/MRZCameraStep.tsx` 有 5 個正式版 `console.log`，改成 `__DEV__` 下才印，或者刪掉。
- `__tests__/unit/icloudBackupRoundtrip.test.ts:688` 讀原始碼用 regex 比對 `'worklet'`，違反「不寫 source-text 測試」。worklet 的編譯產物測試已經在把關這件事，刪掉這段。
- `docs/ref/05-spec-qr-exchange.md` §7 的對照表還指向已刪的 01／03／04，改成一句「舊文件見 git log」。

## 5. 階段（每階段一筆或幾筆 commit，結尾跑一次 E2E）

| 階段 | 內容 | E2E |
|---|---|---|
| 1 | §1.1 的檔案＋§1.2 中非 ⚠ 的部分，連同只測死碼的測試 | typecheck／lint／test |
| 2 | §1.2 的 ⚠ 項目 | iOS 模擬器冷啟動，加上 Settings 進到需要 Face ID 的動作 |
| 3 | §2 `legacyWipe`（先問 §2 的決定） | 舊資料的模擬器：先確認有 groups／vault 的 key → 跑清除所有資料 → 確認 key 和 alias 都不在，App 回到 onboarding |
| 4 | §4 改名＋小項目 | 社群驗證面板開得起來，i18n 沒有 raw key |
| 5 | §3 註解精簡（最後做，避免和前面的刪除互相衝突） | diff 只有註解；跑 verify |
| 收尾 | Android 冷啟動＋`/code-review`（安全路徑） | 寫 `docs/e2e/<date>-code-cleanup/result.md` |

## 6. 工具

knip（不用裝進 repo）：

```bash
cd apps/expo && bunx knip@5 --config <scratchpad>/knip.json --production --no-exit-code --reporter compact --include files,exports
```

```json
{
  "entry": ["app/**/*.{ts,tsx}!", "pear/worklet/index.js!", "plugins/*.js!", "scripts/**/*.{ts,js}", "__tests__/**/*.ts", "test-setup.ts", "metro.config.js", "babel.config.js"],
  "project": ["app/**/*.{ts,tsx}!", "src/**/*.{ts,tsx}!"],
  "ignoreDependencies": [".*"]
}
```

`--production` 只從 `!` 標記的進入點出發（不算測試），所以「只有測試在用」也會被列出來。knip 對 `import()` 動態載入和 barrel 檔的判斷要人工再確認（例如 `envelopeHandler` 動態載入 `zk/`）。

## 7. 不在範圍

- `packages/parity-fixtures/`（凍結）
- 改產品行為：唯一的例外是 §2 的選項 b，而且要 Kidney 先拍板
- Pear／bare-kit 的去留（App 體積最大的一塊，是另一個產品決定）
