# 2026-10-30 — Linktree-style Page, background link check, theme switch, creds.id lookup

iPhone 18 Pro simulator (iOS 27), dev client + Metro, fresh install (onboarding not finished). Host load 300–470
from other sessions, so taps landed seconds late.

## What changed

- **Link rows** (`ProfileLinksList`): Linktree cards — 44pt avatar (also the drag grip), bold title, URL line, ⋮
  menu (open / edit / verify). A link this phone can check carries a 「驗證 X」 banner under its row (Linktree's
  "Connect Instagram"); no separate page.
- **Background check** (`src/zktls/checkJobs.ts`): the banner copies `creds.id/@name`, opens the bio editor, and the
  check runs when the app returns to the foreground — retries, signs, adds the green check, toasts. Jobs live outside
  React, so leaving the tab never cancels one. Dismissed banners are remembered per link.
- **Drag** (`rowDrag`, `pageRowStyles`): rows may now differ in height (a row with a banner is taller); the drag
  reads each row's measured height instead of one fixed stride.
- **Page**: 「＋ 新增」 and 「＋ 新增連結」 side by side at the top; 區塊 and 證明 fold to one row each with a count.
- **Publish** (`PublishChangesCard`): web `PublishPanel` look — chip-well icon, title, intro, button, ok/warn box;
  stays visible even when 區塊 is folded.
- **Avatar**: the picker offers the profile pictures the Page's links already serve (「從你的連結」).
- **Contacts**: swipe-delete is an inset rounded tile that grows in with the swipe; the add sheet has 「輸入 creds.id
  名稱」 (paste / clear, ASCII keyboard) → opens their Page in the verified-page sheet, where this phone checks every
  link and 「幫他見證」 is one tap.
- **Appearance**: only colour mode is left. Card accent, glow and animal theme are removed; the Present card keeps its
  sheen with a neutral shadow.
- **Theme switch bug** (`src/navigation/themeRefresh.tsx`): React Navigation's memoized `StaticContainer` stopped
  re-renders, so screens reading `Colors.*` kept the old palette. Leaf screens now remount on a scheme change;
  navigators (`(tabs)`) are not remounted, so navigation state survives.

## Ran for real

- `01-appearance-color-mode-only.png` — Appearance has only 色彩模式.
- Live switch 淺色 → 深色 on the Appearance screen: before the fix the selected segment stayed white with dark text on
  a dark page (the reported bug); after the fix `02-live-switch-dark-fixed.png` repaints it.
- `03-contacts-behind-switched-dark.png` — the Contacts tab underneath also fully switched.
- `04-creds-name-field-dark.png` — the creds.id name field in the add sheet, dark.
- Invalid input shows 「這不是 creds.id 名稱（3–30 個英數字）。」 inline.
- `credsNameLink` parsing (throwaway bun check, deleted): `kidneyx`, `@kidneyx`, `creds.id/@kidneyx`,
  `https://creds.id/@KidneyX`, ` www.creds.id/@kidneyx ` → `https://creds.id/@kidneyx`; bopomofo, 2 chars,
  `evil.com/@x`, spaces, empty → rejected.
- Release bundle check for the build 207 passport fix is in `../2026-10-30-integration/result.md`.

## Not run

- **The Page tab redesign on screen** (link cards, banner, folds, publish card, avatar choices, variable-height
  drag): the simulator has no finished onboarding (needs a passkey), so the Page tab shows the setup gate. Typecheck,
  lint and the worklet-artifact test only.
- **Background link check**: needs App Attest (real device) — the banner only shows where `deviceAttestSupported()`.
- Opening a valid name from the field: the simulator's hardware keyboard composes Zhuyin, and paste lagged under
  load. The field calls the same `handleDeepLink` as a `creds.id/@name` universal link, which the integration run
  opened on this simulator.
- Swipe-delete gesture (no contacts on this install).
