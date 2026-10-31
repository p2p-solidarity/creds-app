# 2026-10-30 — 「存入聯絡人」 shows up in Contacts again

Reported: after 「存入聯絡人」 on a verified Page nothing appeared in 聯絡人 ("is MMKV broken?").

## Root cause

Not MMKV. Saving writes the Page to `useProfileSnapshotStore` (its own MMKV key), and the write landed. But the
聯絡人 list renders only the contact manifest (`useContactStore`); the section that listed saved Pages
(`VerifiedPagesSection`) was deleted on 2026-08-19 (8bffcbec), so a saved Page had nowhere to show.

## Fix

- `VerifiedPagesSection` + `relativeVerifiedAt` restored; the section is the Contacts list header (hidden while
  searching / selecting). With saved Pages but no contacts it replaces the empty state.
- i18n: `peopleList.savedPagesHeader`, `declaredBadge`, `verifiedPage*Ago` back in en / zh-Hant.

## Ran for real (iPhone 18 Pro sim, dev client)

- Opened `https://creds.id/@kidneyx` → verified-page sheet → 「存入聯絡人」 → sheet closes.
- `01-contacts-saved-page-shows.png` — 聯絡人 shows 已儲存頁面 → Kidney, 1 分鐘前, with no relaunch.
- `02-saved-page-detail.png` — tapping the row opens the saved Page (signature valid, this phone's checks, links).

## Not run

- Real device; a declared (unsigned) Page row; Android.
