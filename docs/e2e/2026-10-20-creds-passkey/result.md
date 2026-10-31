# 2026-10-20 · creds.id passkey sign-up / management E2E

Plan: `docs/ref/08-plan-passkey-root-sync.md` §5 (2026-10-20 revision).

## Phase 1 — owner index (shared + backend)
Local `wrangler dev -c wrangler.nip05.jsonc` with all 4 D1 migrations, driven by real `@solidarity/shared`
crypto (`phase1-vault-owner.log`): owned create ×2 + legacy create → list shows only owned → legacy claim →
rename → stranger DELETE 404 → owner DELETE 204 → public GET returns only `{v, ciphertext}` → remaining
passkey still unlocks the same mnemonic.

## Phase 2 — creds.id (airmeishi-web) in the in-app browser
`localhost:5731/edit`, `/vault` proxied to the local worker, real directory availability check against creds.id.
WebAuthn was a page-level shim (fake authenticator with PRF = sha256(secret‖input)); UI, crypto and server were real.

| Step | Result |
|---|---|
| Type `e2epasskey1020` | live "@e2epasskey1020 可以使用" from the production directory |
| 用 Passkey 繼續 | passkey `user.name = e2epasskey1020@creds.id`, row uploaded (no pending), session unlocked, editor opens with the claim intent |
| Passkey 管理 | 1 row, "目前登入" |
| 新增 Passkey (same provider) | refused via `excludeCredentials` → "這個密碼管理工具已經有…" copy |
| 新增 Passkey (other provider) | re-verify + create, 2 rows |
| 改名 → 我的 iPhone | persisted (sealed meta PATCH) |
| 顯示救援詞 | re-verify, 24 words + warning, copy / download / hide |
| 登出 → 用第二把登入 | same npub `npub1nu4dh…6mmg` |
| 刪除第一把 | row gone, `signalUnknownCredential` called with its credential id |
| 刪除最後一把 | blocked until "我已保存救援詞" is checked |
| Mobile 375px | sign-up card fits, no horizontal scroll |

## Not run
- Real iCloud Keychain / Google Password Manager PRF (needs a real device; the pane can't drive OS passkey sheets).
- Publishing to live relays / claiming the name on the production directory (outward-facing; publish code unchanged).
- Upload-failure → next sign-in retry: covered by `test/passkeyAccount.test.ts`, not by the browser run.

## Phase 5 — App (iOS 27 simulator, iPhone 18 Pro, dev client)
Local worker seeded with a throwaway identity owning two passkey rows (one "web", one "iOS"); the dev build's
vault origin was pointed at `localhost:8787` for the run only (reverted, not committed — writing test rows to
production was blocked). Identity imported through onboarding › 我已經有帳號 › 輸入復原字詞.

| Step | Result |
|---|---|
| Settings › 通行密鑰 | loading → both rows, labels decrypted from sealed meta (`E2E 網頁 Passkey` · Chrome · macOS · 網頁; `E2E 舊 iPhone` · iOS App) |
| Row › rename `… renamed` › 儲存名稱 | server list shows the new label |
| Row › 移除通行密鑰 › confirm | row gone in app and on server |
| 在電腦上編輯 | shows `creds.id/edit` + 開啟 when server passkeys exist (was "add a passkey first" — fixed) |

Repo verify after the run: `bun run typecheck && bun run lint && bun run test` → 0 errors, 1817 pass.

### Not run
- Creating a passkey from the App on the simulator (needs the creds.id associated domain on a signed device).
- The App against the production service (blocked from writing test rows there).
