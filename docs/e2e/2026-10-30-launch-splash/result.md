# 2026-10-30 — launch animation actually visible; Pro uses the creds mark

Reported: 「希望有啟動動畫」 and 「pro plan 的 logo 換我們 logo」.

## Root cause (launch)

`LaunchSplash` (rings swing in, lock, "creds.id" slides, dots drop) existed since 10-29 but mounted only after boot
finished, together with the whole app, and started its timeline at mount. The native splash hid only after that
first heavy layout, so on a phone the rings/text/dots played under the native splash or lost their frames to the
app's first mount — what showed was mostly the fade. It also always drew light colours, so dark mode jumped from the
navy native splash to cream.

## Fix

- `app/_layout.tsx`: the splash renders from the first frame (no `return null` before boot); the app mounts under
  it once boot is ready **and** the logo has settled; the fade starts after the app's first layout.
- `LaunchSplash`: timeline starts when `SplashScreen.hideAsync()` resolves (800 ms fallback); `onSettled` at
  1.1 s; minimum hold 1.35 s; exit fallback timer. Colours follow the system scheme read once at mount (same as the
  native splash), dark ink/accent/ground in dark mode.
- Pro hero badge and Settings 方案 row: `CredsMark` instead of `sparkles` / `checkmark.seal.fill`.

## Ran for real (iPhone 18 Pro sim, dev client)

- `01-cold-start-frames.jpg` — cold start, 10 fps: rings swing in → lockup → dots → held while boot runs → app.
  Before the fix the same recording showed the logo for about one frame.
- `02-dark-cold-start.jpg` — dark mode: navy ground, light ink, then the app.
- `03-pro-creds-mark.jpg`, `04-settings-plan-row.jpg` (row mark later trimmed 18 → 16 pt).

## Not run

- Release build on a real phone (the timing argument is about the release path; the dev client boots slower, which
  only lengthens the hold). Android.
