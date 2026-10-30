# 2026-10-31 — Changing the profile photo stays on the Page tab

## Reported
Tapping the Page photo pushed the full 編輯 screen just to show the photo sheet, so closing it felt like
leaving two pages.

## Fix
- Page tab hosts the photo picker itself (`AvatarEditorSheet` + `useAvatarEditor`); the save/publish chain
  moved out of `app/me/edit.tsx` into `components/me/saveAndPublishProfile.ts`, shared by both.
- 設計 › 頭貼 › 更換個人照片 closes the Design sheet and opens the photo sheet once iOS finishes the dismissal
  (`ModalSheet` `onDismiss`); iOS will not present a sheet while another is still sliding away.

## Ran for real (iPhone 18 Pro sim, dev client)
- `01` — tap the Page photo: 個人照片 sheet opens over the Page tab, no editor screen.
- `02` — 設計 › 頭貼 › 更換個人照片: Design sheet closes, 個人照片 sheet opens.
- `03` — ✕ on the photo sheet lands straight on the Page tab.

## Not run
- Picking a library photo / link avatar / remove from the Page tab (same `useAvatarEditor` code as before);
  Android hand-off; publish on a key-holding account.
