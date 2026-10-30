# 2026-10-30 — raw i18n keys, blank 「找不到證明」 page, proof removal, button centring, link drag

## Root causes

- **Raw keys (`ob.welcome.title`)**: the 8 s boot timeout showed the app before `installI18n` ran; screens rendered
  then never re-rendered with translations. Seen live on the sim (`01-…`, log `show-app:timeout-8000ms` before
  `mmkv:done`). Fix: the timeout installs i18n (device language) first; boot's later `installI18n` switches to the
  persisted language if it differs.
- **Blank 「找不到證明」 after a proof**: Page proof row → credential detail (retired passport) → rescan → the rescan
  deletes the old record → back lands on the deleted credential's detail. Fix: the detail screen leaves when its
  credential disappears.
- **Removing a proof**: removing a credential deleted only the record; its identity card and claims stayed, so the
  Page kept 國籍／真人／姓名／18+ rows that opened the blank page. Fix: `removeCredentialAndClaims` (detail remove +
  rescan replacement), and `sweepOrphanedClaims` on the Page drops claims whose credential is gone (only after both
  stores hydrate).
- **Off-centre button labels**: `adjustsFontSizeToFit` gives the label the full row width, left-aligned → added
  `textAlign: 'center'` + `flexShrink: 1` in `ThemedButton`.
- **Profile editor links**: ↑↓ buttons replaced by a ☰ drag handle (shared `rowDrag`, long-press then drag;
  VoiceOver adjustable).

## Ran for real (iPhone 18 Pro sim, dev client)

- `01-raw-keys-after-boot-timeout.jpg` (before) / `02-translated-after-fix.jpg` (after a relaunch).
- Centred label on 「設定身份」; typecheck, lint, `bun run test` (1503 + 73 pass).

## Not run

- The timeout path itself after the fix (the relaunch booted under 8 s).
- Link drag, proof removal, rescan return, physical-card buttons: need a finished onboarding (passkey) — real device.
