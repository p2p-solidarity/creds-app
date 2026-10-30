# 2026-10-30 — People: saved Pages in the A–Z list; passport Save runs once

## Reported
1. NFC passport last step (加入計數) saved twice → 8 claims instead of 4.
2. 聯絡人 and saved Pages not unified — they should show together.
3. Request proof (Pear, 請求證明) still 閃退.

## Root causes / fixes
1. `app/passport/index.tsx` `onPersist`: `isLoading` turned on only after the Face ID gate, so a second
   tap on Save (or one inside the biometric grace window) started a second save that also found no saved
   passport → two credentials, two statements, 4 + 4 claims. A synchronous `useRef` in-flight lock now
   drops the second call.
2. Saved Pages lived in a separate header section above the contacts. `groupContactsByInitial` now takes
   the saved Pages too, so contacts and Pages sort into one A–Z list and search covers both
   (`SavedPageRow` replaces `VerifiedPagesSection`). While selecting (delete / export vCard) the list
   shows contacts only.
3. Not fixed — not reproduced (see below).

## Ran for real (iPhone 18 Pro sim, dev client, metro from this checkout)
- `01-people-unified-list.png` — 聯絡人 with one saved Page: it sits under "K" in the A–Z list with the
  search field, instead of a separate 已儲存頁面 section.
- Tapping the row opens the saved Page detail.

## Not run
- Passport save on a real chip (NFC needs a device) — the double-save lock is unproven on device.
- A list holding both contacts and saved Pages (sim had only a Page).
- Request proof: needs two devices on Pear; XR was unavailable, no crash report pulled.
