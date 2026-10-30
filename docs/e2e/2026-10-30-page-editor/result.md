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

## Not run
- Saving from the Page tab (add link, music / form blocks, bio save, publish): each re-signs the
  Page and may publish to Nostr; production publish not approved, so not run.
- The Design panels 背景 / 文字 / 頁尾 were not opened on the sim (only 模板 and 頭貼).
- Spotify / YouTube player rendering on creds.id itself was not re-checked — the blocks use the
  existing `featured` / `video` types the web already plays (`RichBlocks.richMediaFor`).
- Android.

## Verify
`bun run typecheck && bun run lint && bun run test` from the repo root: typecheck 0, lint 0
errors (169 warnings, pre-existing), test 1503 unit + 73 parity pass / 0 fail — re-run after the
three fixes, and again after round 2 (lint 170 warnings, 0 errors).
