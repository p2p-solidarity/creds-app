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

## Not run
- **Page tab** (the new add sheet with search / tiles / 建議 list, music + form steps, bio sheet,
  the web-palette preview, template swatches): reaching it needs finishing onboarding, which
  publishes the chosen name to the production creds.id directory + Nostr relays. Not approved
  (asked via the parent session); not run.
- Spotify / YouTube player rendering on creds.id itself was not re-checked — the blocks use the
  existing `featured` / `video` types the web already plays (`RichBlocks.richMediaFor`).
- Android.

## Verify
`bun run typecheck && bun run lint && bun run test` from the repo root: typecheck 0, lint 0
errors (169 warnings, pre-existing), test 1503 unit + 73 parity pass / 0 fail — re-run after the
three fixes.
