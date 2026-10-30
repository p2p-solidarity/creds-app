# Contacts row unify + local details on saved Pages (2026-10-31)

Simulator: iPhone 18 Pro (iOS 27), dev client + metro from this checkout.

## Ran
- Contacts list with one manual contact + one saved Page: both rows now share
  38pt initial avatar, bodyLarge name, caption subtitle, full-width divider,
  same chevron. Page row carries a 「頁面」 label before the relative time.
  `light.png`, `dark.png`, `edit-mode.png` (checkbox + avatar).
- Saved Page detail → 「新增電話、Email 或備註」 → filled phone + note → 儲存 →
  rows render under 「你加的資訊 / 只存在這支手機」 (`page-detail-empty.png`,
  `page-detail-filled.png`); kill + relaunch → still there
  (`page-detail-after-relaunch.png`).
- `bun test profileSnapshots.test.ts portableData.test.ts` 44 pass; tsc clean
  except `app/passport/index.tsx` (another session's in-progress work); eslint
  clean on touched files.

## Not run
- Tapping the tel:/mailto: rows (simulator has no Phone app).
- Backup/restore round-trip of the new fields (backup copies the snapshot
  blob verbatim, so they should ride along — not exercised).
- Full `bun run test`.
- Declared (link-page import) entries can't take local details yet.
