# 2026-10-31 — Switches sit centred in their rows

## Reported
訂製實體卡 → 刻在卡上: the switches sat at the top of each 52-pt row, not centred.

## Root cause
React Native's iOS `Switch` composes `{ alignSelf: 'flex-start' }` into its own style
(`react-native/Libraries/Components/Switch/Switch.js`), which overrides the parent row's `items-center`.
Any row taller than the switch pins it to the top. Only `ProfileSectionsList` passed `alignSelf: 'center'`.

## Fix
`style={{ alignSelf: 'center' }}` on every other `Switch`: PhysicalCardSheet, SettingRow `ToggleRow`,
SettingsBlocks `SettingsBlockToggleRow`, PageAppearanceSheet footer.

## Ran for real (iPhone 18 Pro sim, dev client)
- `01-physical-card-switches-centred.png` — 名字 / 使用者名稱 / QR switches centred in their rows.

## Not run
- Settings hub, Page appearance and Pear reachable toggles not re-screenshotted (same one-line fix); Android.
