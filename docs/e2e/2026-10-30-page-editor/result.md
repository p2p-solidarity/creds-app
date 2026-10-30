# 2026-10-30 — Page editor redesign (web look, Linktree add sheet)

Commits: be715a7e (buttons / inputs / brand badges), 8d17e86c (preview palette + players),
b5237b61 (add sheet, music, form, bio), plus the fixes below.

## Run
iPhone 18 Pro simulator (DD354DEA, iOS 27), dev client, Metro 8081 from the main checkout.
Fresh onboarding state (zh-Hant). Driven with `idb ui tap` + on-screen keys (the simulator
tool's text entry does not reach a Zhuyin keyboard).

| # | Screen | Shows |
|---|---|---|
| 01 | username, light | input row: mono `creds.id/@` prefix, red error border + message |
| 02 | username, light | name available (✓), primary CTA enabled |
| 03 | passkey step, light | primary + secondary both 48 pt |
| 04 | passkey step, light | loading primary keeps its 48 pt |
| 05 | add link, light | platform chips with brand-coloured round badges (Instagram gradient, new Threads / TikTok presets) |
| 06 | Threads handle, light | bug: `threads.com/@` + `@username` placeholder → `@@username` |
| 07 | Threads handle, light | fixed: `threads.com/@username` |
| 08 | welcome, dark | primary = cream fill with near-black label (web `--color-inverted`), secondary = card + divider |
| 09 | username, dark | input row in dark tokens |
| 10 | passkey step, dark | button pair, equal heights |
| 11 | add link, dark | brand badges; black marks carry a hairline edge (GitHub was missing it → fixed) |

## Bugs found by this run and fixed
- **Input never took focus** (ThemedTextInput rewrite): wrapping the native field in a
  pressable row, or changing the row's `boxShadow` on focus, left taps dead. Bisected on the
  sim (old file focuses, new file without both does). Now: plain row, only the icon well is a
  tap-to-focus target, focus shows as the primary border (same as web `.field-input:focus-visible`).
- **`@@username`** on Threads / YouTube handle fields — placeholder drops its own `@` when the
  prefix ends in one.
- **GitHub badge invisible on dark** — `#181717` now gets the same hairline edge as `#000000`.

## Round 2 — Kidney's feedback (list, not squares; Linktree Design screen)
After a sim reboot the app opened past onboarding (on Settings › 通行密鑰, then the Page tab) —
this session did not finish onboarding. Only sheets were opened; no link, bio or photo was saved,
the template was put back to 米白 and 發布 was never tapped, so nothing was published.

| # | Screen | Shows |
|---|---|---|
| 12 | add sheet, light | one vertical 建議 list: 連結 / 音樂 / 表單 / 證明 rows, then brand rows |
| 13 | add link, light | 或選擇平台 as the same scrolling row list (badge + name + one-line description) |
| 14 | Design, light | live preview inside a phone bezel (as a visitor's phone shows it), bottom bar 模板 / 頭貼 / 背景 / 文字 / 頁尾 |
| 15 | Design › 模板, light | panel slides up over the preview; template swatches |
| 16 | Design › 漸層, light | preview repaints with the web gradient palette |
| 17 | Design, dark | bezel + bar in dark tokens |
| 18 | Design › 頭貼, dark | change photo + bio editor in the panel |
| 19 | add link, dark | platform list in dark |

Bug found and fixed: the preview avatar painted a square behind the disc (shadow on the clipping
gradient); the shadow now sits on a round wrapper (14 vs the first Design screenshot).
Seen, not fixed: switching the sim to dark while the Design sheet was open dismissed the sheet.

## Round 3 — Page tab for real (Kidney approved the publish: "OK, release after", then "Publish, keep claimed")
Onboarding finished with the name **230701**, and it is live in the creds.id directory:
`/.well-known/nostr.json?name=230701` → `c1f55acf…5862`, availability `taken`. The app has no
way to release a name: Settings › 我的名稱 can only register or rename, and the backend's
`DELETE /id` would leave a permanent tombstone. Kidney chose to keep @230701 claimed.

| # | Screen | Shows |
|---|---|---|
| 20 | onboarding ready | creds.id/@230701 · 正在發佈… (relay + directory publish) |
| 21 | Page tab | header shows creds.id/@230701 |
| 22 | add link › GitHub | handle typed, detected card with the GitHub avatar |
| 23 | 已加上 | link saved, GitHub avatar became the Page photo |
| 24 | Page tab | link row in 公開頁 |
| 25 | add music | Spotify track URL detected, player facade preview |
| 26 | bio sheet | bio typed, 42 / 160 |
| 27 | Page tab | bio + 區塊 2 個 + 發布頁面變更 card |
| 28 | after 發布 | 已發布頁面變更 · 已上線：creds.id/@230701 |
| 29 | add music (fix) | title placeholder now 音樂 (was 填寫表單) |
| 30 | add link › GitHub (fix) | placeholder now `github.com/username` (was `github.com/@username`) |

**Bug found, not fixed (needs a product call):** the 發布 card says 已上線：creds.id/@230701,
but it only re-signs the Page locally (`savePageDesign`). The relay publish runs only when
the developer toggle `nostrAutoRepublish` is on, and it is off by default. After 28, primal
and nos.lol still held only the 14:21Z onboarding events (bio "", links []). creds.id/@230701
in a browser showed the onboarding version, with no link, bio or music. damus refused our
read, so it was not checked.

Bugs found and fixed: music title placeholder (填寫表單 → 音樂), and the `@` on handle
placeholders after a `/` prefix.

Seen, not fixed: with the keyboard up, the first tap on a sheet's CTA or close button only
dismisses the keyboard (add music, bio sheet, add link), so it takes a second tap.

Sim driving for this run: the simulator pasteboard stayed empty (`simctl pbcopy` didn't reach
it), and typing over HID went through the Zhuyin hardware layout. The run set the sim's
keyboards to English only, then deleted those prefs again afterwards.

## Not run
- The form block: it needs a real form-service URL, and a made-up one would publish a broken
  link. Not run.
- The web page actually showing the link, bio and Spotify block: blocked by the publish bug above.
- The Design panels 背景 / 文字 / 頁尾 on the sim (only 模板 and 頭貼).
- Android.

## Verify
`bun run typecheck && bun run lint && bun run test` from the repo root: typecheck 0, lint 0
errors (169 warnings, pre-existing), test 1503 unit + 73 parity pass / 0 fail — re-run after the
three fixes, again after round 2, and again after round 3's fixes (lint 171 warnings, 0 errors; 1503 + 73 pass).
