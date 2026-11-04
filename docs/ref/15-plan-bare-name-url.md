# 15 — Plan：不帶 `@` 的名稱網址（`creds.id/gimmy`）與保留字表

> 2026-11-04 · 狀態：**P0 完成**——後端保留字已上線（backend `6197549`，worker `solidarity-id` 版本 `9193b1d8`；199 字線上逐字回 `reserved`），收窄版 AASA 已上線（web `main` `d28df9a`，Apple CDN 已更新）。**P1 已做、未合併**（2026-11-05）：airmeishi `claude/bare-name-p1`、web `bare-name-p1`、backend `c08c0ff`（已部署 `7d3aaf5c`）；E2E 見 `docs/e2e/2026-11-05-bare-name-p1/result.md`。P2–P3 尚未動。
> 範圍：`packages/shared`、`apps/expo`、`apps/notary`、`../airmeishi-web`、`../airmeishi-backend`（NIP-05 worker `solidarity-id`）。
> 屬於 **L**：會動到 witness 的 bio 標記比對、名稱註冊、iOS / Android 系統連結。名字一旦發出去就收不回，所以保留字要在推廣短網址**之前**先上線。

## 0. 決定摘要

1. **名稱格式不動**：`[a-z0-9]{3,30}`。這個限制本身就讓所有帶 `.` `-` `_` 的路徑、1–2 字元的路徑永遠不會跟名字撞（§2.2）。
2. **`/@name` 永久有效**，是「這一定是人」的那條路。`/name` 是好記的別名，**只給 creds.id 名稱**，而且只在 `creds.id` 這個 host。外部 handle（`@alice.bsky.social`、`@alice.eth`、`@dns:example.com`）照舊帶 `@`。
3. **只有一個判斷點**：shared 的 `classifyCredsPathSegment()` 決定頂層路徑是什麼。web 路由、Pages Function、app 的 deep link parser、AASA 產生器、後端註冊都用它（或它的清單），不再各自寫一份。
4. **保留字表 199 字、6 組**（§3）。2026-11-04 實測：43 字後端已保留，156 字可註冊，**0 字已被註冊**，現在加不會從任何人手上收回名字。
5. **未來新頁面的規則**（§4）：新頁面只能用不可能是名字的路徑；真的要新的單字路徑，上線前先把字加進表。名字永遠不從使用者手上收回。
6. **分享網址改短版，分三步**（§6）：先讓所有讀的人兩種都認得 → 再把給人看的地方換成短版 → 新版普及後，QR、bio 標記和 iOS 系統連結才換短版。

## 1. 現況（2026-11-04 讀 code + 實測）

| 地方 | 現在只認 `/@` 的位置 |
|---|---|
| web 路由 | `airmeishi-web/src/router.tsx` 的 `/$handle`；`src/pages/ViewerProfilePage.tsx:45` 先檢查 `startsWith('@')`，沒有就 NotFound |
| web 連結預覽 | `functions/[handle].ts` + `src/og/ogProfile.ts:17`（`^@([a-z0-9]{3,30})$`）；`public/_routes.json` 只把 `/@*` 送進 Functions |
| web 產生網址 | `src/websign/viewerShare.ts:81,104`、`src/components/PublishPanel.tsx:45,120`、`ProfileCard.tsx:48,109`、`LoadExistingPage.tsx:19`、`builder/SessionChip.tsx:32`、`og/ogProfile.ts:59,67`、i18n 文案 7 處（`creds.id/@you`）、`ClaimNameForm.tsx` 前綴 |
| app 解析 | `apps/expo/src/deeplink/parser.ts:76`（`parseVerifiedHandleRoute`） |
| app 產生網址 | `components/me/meProfileModel.ts:75-78`、`onboarding/publicPageUsername.ts:90`、`deeplink/credsName.ts:13`、輸入框前綴 `creds.id/@`（`UsernameStep.tsx:94`、`app/settings/username.tsx:137`、`ContactsAddSheet.tsx:101`） |
| bio 標記（witness） | `packages/shared/src/zktls/platforms.ts:84` `MARKER_DOMAIN = 'creds.id/@'`、`zktls/xProfile.ts:69`；app 複製標記 `zktls/checkJobs.ts:96`、`components/verify/SocialVerifyPanel.tsx:113` |
| 名稱格式（寫了 4 份） | shared `handles/nip05.ts:7`、web `identity/nameInput.ts:2` 和 `router.tsx` 的 `CLAIM_NAME_RE`、backend `lib/nip05/name.ts` |
| 保留字（1 份） | `airmeishi-backend/src/lib/nip05/constants.ts:24`（45 字）；只有 register 擋（`request.ts:97`），recover 不擋（名字已存在才能 recover） |
| 系統連結 | AASA `airmeishi-web/public/.well-known/apple-app-site-association` 只有 `/@*`；Android `apps/expo/app.json` 一個 intent-filter 同時列 3 個 host + `pathPrefix /@` |

實測：

- **線上 AASA 還是 `{"/": "*"}` 全收**。收窄版（web `b1fea68`）已 commit 在 web `2.0.1`，還沒部署。所以今天 iOS 上裝了 2.0.0 的人點 `creds.id/gimmy` 或 `creds.id/edit` 都會開 app → Unmatched Route（「不認得的 creds.id 網址改開 in-app browser」的保底 `b9442892` 今天才進 2.0.1，2.0.0 沒有）。
- `creds.id/gimmy` 在瀏覽器今天回 200（SPA），畫面是 NotFound。
- 網站現在用到、而且符合名稱格式、卻**沒有**保留的路徑：`app`、`edit`、`websign`、`pear`（舊連結）、`vault`、`pro`（worker 路由 `/vault/root*`、`/pro/*`）、`assets`。全部還沒人註冊——這是 P0 要立刻補的洞。

## 2. 路由規則：唯一的判斷點

### 2.1 shared 新增 `packages/shared/src/handles/credsPath.ts`

```ts
export const CREDS_NAME_RE = /^[a-z0-9]{3,30}$/u;     // 取代另外 3 份
export const RESERVED_NAMES: ReadonlySet<string>;     // §3
export const SITE_PAGES = ['app', 'edit', 'privacy', 'terms'] as const; // 有網頁的保留字

export type CredsPathSegment =
  | { kind: 'handle'; handle: string }   // '@…'：任何 resolver（nip05 / atproto / ens / dns），行為不變
  | { kind: 'name'; name: string; canonical: boolean } // 不帶 @ 的 creds.id 名稱
  | { kind: 'reserved'; word: string }   // 網站的字（有沒有頁面都算）
  | { kind: 'other' };                   // 不是名字形狀

export function classifyCredsPathSegment(raw: string): CredsPathSegment;
```

判斷順序：

1. 開頭是 `@` → `handle`（現在的行為）。
2. 原字串（不 percent-decode、不轉小寫）符合 `CREDS_NAME_RE`：在 `RESERVED_NAMES` → `reserved`；否則 → `name`（`canonical: true`）。
3. 轉小寫後才符合（`/Gimmy`）→ 一樣走第 2 步，`canonical: false`：web 用 replace 導到小寫網址，app 直接用小寫。
4. 其他 → `other`。

只在 host 剛好是 `creds.id` 時才做 2–3。`solidarity.gg`、`airmeishi.app` 是 landing / 舊網域，它們的路徑不歸我們分類，只保留 `/@`。

### 2.2 結構上永遠不會撞的路徑（不用列進表）

名字只會是 3–30 個小寫英數，所以下面這些永遠是網站的：

- 帶 `.` 的：所有靜態檔（`llms.txt`、`index.md`、`favicon.ico`、`og-card.jpg`、`sitemap.xml`…）、`/.well-known/`
- 帶 `-` 或 `_` 的：`/delete-account`、`/cdn-cgi/`
- 1–2 字元的：`/c/`、`/id/`
- 第二段以後：`/c/<uuid>`、`/api/…`

### 2.3 為什麼 `/@` 一定要留

- 外部 handle 必須帶 `@`：`index.md` 同時是我們的靜態檔，也是合法網域（`.md` 是真的頂級網域），不帶 `@` 就分不出來。
- 萬一以後真的有名字跟網站頁面撞（例如誤發出去的名字），網站頁面拿走 `/word`，那個人還是可以用 `/@word` 找到。
- 已經印在名片上、貼在 bio 的 `/@name` 一個都不能壞。

## 3. 保留字表（199 字）

全部符合 `[a-z0-9]{3,30}`、無重複，是後端現有 45 字的超集（後端的 `_`、`c`、`id` 不符合名稱格式，本來就不會比到，搬到 shared 時拿掉）。

| 組 | 數量（新增） | 字 | 為什麼 |
|---|---|---|---|
| **A 網站正在用** | 11（8） | app edit privacy terms websign pear vault pro api assets index | web 頁面、app 系統連結、worker 路由、靜態目錄；`pear` 已拔除但舊連結還在外面；`/index` 會被 Pages 308 導回 `/`（實測），這個名字永遠開不到 |
| **B 可能變成網站頁面** | 106（106） | account accounts login logout signin signout signup register settings profile profiles about docs faq blog download downloads pricing upgrade status search explore new create claim share scan check present people contacts card cards page pages link links embed widget home dashboard inbox notary witness witnesses badge badges proof proofs passport passkey passkeys recover recovery backup restore delete oauth auth callback sso license licenses cookies policy policies contact feedback report dmca copyright careers jobs press brand community developer developers sdk static media images files uploads cdn sitemap robots favicon manifest rss feed webhook webhooks graphql relay relays nip05 did lnurl ios android user users wallet attest attestation | 產品裡已經有的概念（Page、People、Verify、Present、passkey、notary、witness、backup）＋網站常見頁面＋技術路徑 |
| **C 信任與冒充** | 30（2） | admin administrator root system official verified verification verify security abuse support help helpdesk moderator mod staff team bot solidarity solidaritygg airmeishi creds credsid credentials nostr legal billing pay payment invoice | 拿到就能假裝官方；新增 `solidaritygg`、`credentials` |
| **D 信箱與網域慣例** | 13（6） | postmaster hostmaster webmaster www mail smtp ftp ns1 ns2 info noc noreply mailerdaemon | NIP-05 的 `name@creds.id` 長得像 email。CA 用 `admin@` `administrator@` `webmaster@` `hostmaster@` `postmaster@` 驗網域所有權，只要 creds.id 哪天收信，這些字給了使用者就是發憑證的風險；其餘是 RFC 2142 信箱 |
| **E 範例與佔位** | 22（17） | you yourname name username handle example demo test dev staging null undefined none nobody anonymous everyone true false mika theo rin ada | 文案用的 `creds.id/@you`、輸入框 placeholder `name`；`mika` `theo` `rin` `ada` 是首頁插圖顯示的 `@mika` 等人物；`null` 這類字防程式把空值印成網址 |
| **F 平台名** | 17（17） | twitter github telegram bluesky bsky youtube spotify instagram threads tiktok linkedin facebook apple google atproto ens dns | Page 上有這些平台的徽章，`creds.id/github` 看起來像官方帳號；`atproto` `ens` `dns` 是 resolver 的 scheme 名 |

故意**不**收的：一般人名（`alice`、`bob`——只出現在程式註解，不在畫面上）。`x` 是 1 字元，本來就不可能是名字。

## 4. 以後新增網站頁面的規則

1. 新頁面優先用不可能是名字的路徑：帶 `-`（像 `/delete-account`）、放在既有保留字底下（`/app/…`、`/pro/…`、`/edit/…`）、或 1–2 字元前綴。
2. 真的需要一個新的單字頂層路徑：先查 `GET https://creds.id/id/availability?name=<word>`。
   - `available` → 先把字加進 `RESERVED_NAMES`、部署後端，然後才上線頁面。
   - `taken` / `tombstoned` → 不能用，換路徑。**名字永遠不從使用者手上收回**（跟 tombstone「名字永不回收」是同一個承諾，`constants.ts` 有寫）。
3. 有網頁的字同時加進 `SITE_PAGES`：AASA 會自動排除它，app 收到它會交給瀏覽器（§5）。
4. 行銷頁（pricing、blog、about）放 solidarity.gg。creds.id 的頂層留給人。

## 5. 系統連結

### 5.1 iOS：AASA 由 web build 產生，不再手寫

```json
"components": [
  { "/": "/",        "comment": "#nostr:<npub> / #<fragment>" },
  { "/": "/@*" },
  { "/": "/c/*" },
  { "/": "/websign" },
  { "/": "/*/*", "exclude": true, "comment": "多段路徑不是名字" },
  { "/": "/*.*", "exclude": true },
  { "/": "/*-*", "exclude": true },
  { "/": "/*_*", "exclude": true },
  { "/": "/app", "exclude": true },
  "… RESERVED_NAMES 每個字一條 exclude …",
  { "/": "/???*",    "comment": "不帶 @ 的名稱；長度上限和大寫由 app 再擋" }
]
```

Apple 文件：`*` 是貪婪比對，會跨過 `/`；`?` 是單一字元；第一個命中的規則生效，所以 exclude 要放前面。`/???*` 表達不了「最多 30 字」和「只能小寫」，這兩個由 app 的 classify 擋，擋下的交給 in-app browser（`app/+native-intent.tsx`）。最後一條 `/???*` 到 **P3** 才加（§6）；產生器在那之前只輸出到 exclude 為止。

### 5.2 Android：creds.id 自己一個 intent-filter

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="creds.id" />
  <data android:path="/" />
  <data android:pathPrefix="/@" />
  <data android:pathPrefix="/c/" />
  <data android:path="/websign" />
  <data android:pathAdvancedPattern="/[a-z0-9]{3,30}" />
</intent-filter>
```

- **一定要分開成 creds.id 專用的 filter**：同一個 filter 裡的 host 和 path 會交叉組合，現在的 filter 同時列了 `solidarity.gg`、`app.solidarity.gg`，直接加會連 `solidarity.gg/about` 都認領。
- `pathAdvancedPattern` 是 API 31 才有。API 29/30 會忽略這個屬性——所以同一個 filter 裡要保留明確的路徑；只寫 scheme + host、沒有任何路徑的 filter 會認領整個網域。29/30 上短網址會開瀏覽器，web 照樣能看。
- API 35 前沒辦法排除特定路徑（`uri-relative-filter-group` 是 API 35 才有；舊系統會忽略整個元素，filter 反而變成全收）。所以 Android 12+ 點 `/edit`、`/privacy`、`/terms`、`/app` 會先開 app，app 看到 `reserved` → 用 in-app browser（Custom Tab）打開網頁。**要在實機確認 Custom Tab 不會再把連結丟回 app（迴圈）**。之後可以順手讓 `/privacy`、`/terms` 開 app 內的法律文件頁、`/app` 開首頁。
- Expo `intentFilters` 不一定會寫出 `pathAdvancedPattern`，prebuild 後要看 `AndroidManifest.xml`，不行就寫一個 config plugin。

## 6. 分享網址：改短版，分三步

誰讀得懂什麼：

| 讀的人 | `/@name` | `/name` |
|---|---|---|
| 瀏覽器（P1 的 web 部署後） | ✓ | ✓ |
| iOS 2.0.0，經由 AASA | ✓ | AASA 認領短版的話 → Unmatched Route ✗ |
| Android 2.0.0 | ✓ | 舊版 APK 沒認領 → 開瀏覽器 ✓ |
| 2.0.0 app 內掃 QR | ✓ | 不認得 ✗ |
| 舊版 app 檢查 bio 標記（tier 4，看別人頁面時自己抓） | ✓ | `markerMissing` ✗ |
| notary、web | 部署就更新 | 部署就更新 |

所以：

- **P1 讀兩種**：所有讀網址的地方都認得短版，但還沒有地方輸出短版。
- **P2 給人看的地方換短版**：web 的分享網址和文案、og:url、瀏覽器裡把 `/@name` replace 成 `/name`、app 的分享連結和顯示文字、輸入框前綴。安全的前提是 AASA 還沒認領短版：舊版 iOS 收到短網址會開 Safari，web 正常顯示。
- **P3 新版普及後**（看 App Store Connect / Play Console 的版本分佈，或用強制更新）：AASA 加上 `/???*`、QR 內容換短版、複製到 bio 的標記換短版。
- **永遠**：`/@name` 照常解析。不用 301——瀏覽器會永久快取 301，等於不可逆；web 用 client-side replace 就好。

## 7. 分階段

**P0 — 現在，只動伺服器，不依賴任何 client**
- ✅ 後端：`RESERVED_NIP05_NAMES` 加上 §3 的 156 字並部署（2026-11-04，見檔頭）。
- ✅ web：收窄版 AASA `b1fea68` 單獨 cherry-pick 到 web `main`（`d28df9a`）。web production 是 Cloudflare 從 `main` 自動建置的，不是本機部署。線上和 Apple CDN 現在只認領 `/`、`/@*`、`/c/*`、`/pear/*`、`/websign`，所以 iOS 上的 `creds.id/edit`、`/gimmy` 會留在 Safari。`/pear/*` 等 `2.0.1` 的 `7acffd5` 合進 `main` 時才會拿掉。iPhone 會在 app 更新或定期重抓時拿到新 AASA，已安裝的手機不會立刻生效。

**P1 — 讀兩種**
- shared：`credsPath.ts`；bio 標記比對同時接受 `creds.id/name` 和 `creds.id/@name`（安全路徑接縫，用 `tdd`：先列失敗模式，見 §9 第 1 點）。bump 版本 → web 重新 vendor、notary 重新部署。
- web：`ViewerProfilePage`、`ogName` 改用 classify；`_routes.json` 改成 include `/*`、exclude `/assets/*`（之後每個整頁載入都會叫一次 Function，量小時沒差，記一下成本）；`functions/[handle].ts` 拿掉站台 JSON-LD 的規則延伸到 `/name`；`LoadExistingPage`、`ProfileCard` 判斷 pathname 的地方；AASA 改成 build 產生（還不加 `/???*`）。
- app：parser 加不帶 `@` 的分支（只限 `creds.id`；`reserved` → `unknown` → in-app browser）；Android 新 filter；跟 2.0.1 一起出。
- 後端：改成 import shared 的清單（§8 Q3）。
- E2E：瀏覽器跑 `/gimmy`、`/@gimmy`、`/Gimmy`、`/edit`、`/admin`、`/llms.txt`、`/gimmy/`；Android 實機點 `creds.id/gimmy` 和 `creds.id/edit`；iOS 模擬器用 `xcrun simctl openurl` 跑 parser；LINE / iMessage 的連結預覽。

**P2 — 給人看的地方換短版**：§1 表裡「產生網址」那兩列，加上 i18n 文案。web 的 `site-facts.json` / `llms.txt` 屬於 AEO 層，照 web `CLAUDE.md` 先跟你確認再改。

**P3 — 新版普及後**：AASA 加 `/???*`、QR 內容、bio 標記文案。

## 8. 要你決定的（每題附推薦）

1. **分享網址要不要改成短版？** 推薦：要，照 §6 分三步。`/@name` 永遠保留。
2. **F 組平台名（17 字）和首頁示範名（mika / theo / rin / ada）要不要保留？** 推薦：要。代價是真的叫 Mika 的人拿不到 `mika`。另一個做法是把首頁插圖的名字換掉，就不用保留這 4 個。
3. **後端怎麼拿到清單？** 推薦：後端也像 web 一樣 vendor `@solidarity/shared` 的 tgz，直接 import `RESERVED_NAMES`，不要再手抄一份。底線是「後端的清單 ⊇ shared 的清單」：反過來的話，有人能註冊一個路由會當成網站的字，那個名字就只剩 `/@` 能到。

## 9. 順帶發現（會影響這次，但各自是獨立的修正）

1. **bio 標記比對太寬**：`bioCarriesMarker` 後面只擋 `[a-z0-9_]`，所以 bio 裡寫 `creds.id/@alice.eth`（別人的 ENS 頁）或 `creds.id/@alice-fan`，都會被當成 `alice` 的標記。P1 改標記比對時一起收緊：後面接 `-`、或接 `.` 再接英數，都不算；句尾的 `.` 還是算。
2. 線上 AASA 還是全收（§1）。
3. 後端清單裡的 `_`、`c`、`id` 不符合名稱格式，是死的。
4. `solidarity.gg/.well-known/assetlinks.json` 目前會 redirect 到 creds.id；Android App Links 驗證不跟 redirect，所以那個 host 的驗證應該是失敗的。跟這次無關，但拆 filter 時順便決定那兩個 host 還要不要留。
