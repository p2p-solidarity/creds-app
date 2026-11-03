# iPhone Duo check — 2026-11-03

Branch `2.0.1`. Dev client built with Xcode 27.2 (iOS 27.2 SDK), run on the `iPhone Duo`
simulator (iOS 27.2); Metro and the client both on Expo 58.0.21 / RN 0.88.1. Fold / unfold
done by hand in Device Hub. Keyboard numbers come from a temporary `KeyboardEvents` log in
`V2OnboardingScaffold` (removed after the run).

## Bug found

Username step on the inner display after unfolding with the keyboard open: the sticky
「使用這個名稱」 button rode far above the keyboard and covered 「可以使用」 and the
「你的頁面會顯示為…」 line (`03-inner-unfolded.png`, keyboard-controller 1.22.7).

Cause: on fold / unfold iOS posts `keyboardWillShow` with height 0 (logged: `keyboardWillShow 0`
at 951×669). keyboard-controller 1.22.7 reports that as an open keyboard, so
`KeyboardStickyView` stays on its opened offset until the next real show/hide. Fixed upstream in
1.22.8 (commit 3f32550, "zero-height keyboardWillShow", foldable iPhone). Fix here: bump to
1.22.9 and add it to `expo.install.exclude` (Expo 58 pins 1.22.7).

## Ran

| Case | Version | Result | Evidence |
|---|---|---|---|
| Outer display, onboarding step 1 | 1.22.7 | PASS — fills the display; right inset 84pt clears the vertical status bar | `01-outer-onboarding.png` |
| Outer display, keyboard open on username | 1.22.7 | PASS — keyboard 265pt, button right above it | probe log |
| Outer, rotate a quarter turn | 1.22.7 | PASS — stays portrait (orientation lock) | — |
| Unfold with keyboard open → inner, username | 1.22.7 | **FAIL** — button covers the status lines | `03-inner-unfolded.png` |
| Unfold → inner landscape (951×669) | 1.22.7 | zero-height `keyboardWillShow` logged | `04-inner-unfold-with-keyboard.png` |
| Inner landscape, type a name | 1.22.9 | PASS — status lines visible, button at bottom | `06-inner-fixed-typing.png` |
| Fold with field focused → outer | 1.22.9 | iOS posts `keyboardDidShow 250` but draws no keyboard; button sits 250pt up. Library follows the OS value — simulator behaviour, see Not run | `07-outer-after-fold.png` |
| Unfold with keyboard "open" → inner | 1.22.9 | **PASS** — zero-height show no longer counts as open; button back at bottom, lines visible | `08-inner-unfold-fixed.png` |

## Not run

- Real iPhone Duo. The fold case where iOS reports a 250pt keyboard that the simulator does not draw
  can only be judged on hardware.
- Inner display in portrait with the on-screen keyboard (the simulator did not show the software
  keyboard on the inner display in this run).
- Half-folded pose; the Page / Present / Contacts tabs on the inner display.
