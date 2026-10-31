# 2026-10-30 — refresh saved Pages from Nostr now; toast when someone updated

Asked: a button to update other people's Nostr data, and how fast their changes reach this phone; 「最近更新」 should
pop up properly.

## Before

Background sweep on launch / foreground, at most once per **6 h**, ≤ 30 contacts, silent (only a row in
「最近更新」). No manual refresh.

## Now

- Background sweep at most once per **30 min** (`AUTO_REFRESH_MIN_INTERVAL_MS`), still ≤ 30 relay reads.
- **Pull-to-refresh on Contacts** (when any Page is saved): sweeps now, ignoring the interval. Toast: 「已儲存的頁面
  都是最新的」 / 「連不上中繼站…」.
- Any sweep that saves a newer Page toasts 「Kidney 更新了頁面」 (or 「… 和另外 N 人…」) with a success haptic, when
  「顯示『最近更新』」 is on; the entry still lands in 「最近更新」.

## Ran for real (iPhone 18 Pro sim, dev client, idb drag)

- `01-pull-to-refresh-up-to-date.jpg`: pull → spinner → 「已儲存的頁面都是最新的」 for the saved Kidney Page.

## Not run

- The "someone updated" toast: needs the saved Page's owner to publish a newer version during the test.
