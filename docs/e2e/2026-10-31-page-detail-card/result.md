# 2026-10-31 — A saved Page opens on the same name card as a contact

## Reported
New People entries (saved Pages) opened on a bare, unstyled screen instead of the contact's name card.

## Fix
- `personDetailSupport.tsx`: the contact hero card shell (`PersonHeroCard`), the chip (`ChipBase`), a links card
  (`PersonLinksCard`) and `buildLinkRows` for Page links are shared.
- `VerifiedProfileView` (saved Page detail, scan result sheet, Pear results): name card with avatar, name, bio and
  the signature / handle chips → this phone's checks → links as contact-style rows (or the published Page preview).
- Declared (unsigned) Page detail: same chrome and card, with the 「未驗證」 chip and disclaimer kept.
- Contact detail uses the shared shell; no visual change.

## Ran for real (iPhone 18 Pro sim, dev client)
- `01-saved-page-name-card.png` — 聯絡人 → Kidney: gradient name card (K, Kidney, 簽章有效), 你的手機檢查, links card.

## Not run
- Declared Page detail, scan result sheet, a Page with a published `page` block, dark mode, Android.
