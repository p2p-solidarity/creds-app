# Card sizes 小/中/大 + link ⋯ sheet — 2026-10-31

Run on the iPhone 18 Pro simulator (dev client, Metro), test Page `@230701`.

## Ran
- Page tab → link ⋯ → new sheet: the link's own card on the Page ground, 卡片大小 picker,
  打開連結 / 編輯 rows. 中 → 大 → 小 resize the card live (01–03). Backdrop tap closes it.
  Back to 中 leaves no "publish changes" card (medium is omitted from the signed Page).
- 區塊 → Spotify block (大卡) → editor: 大 shows the cover-plate player card, 小 a slim row (04, 05).
  Editor dismissed without saving.
- `bun run typecheck && bun run lint && bun run test` from repo root.
- Web (`../airmeishi-web`): shared 2.2.0 vendored, `tsc`, `oxlint`, `bun test` (239 pass).

## Not run
- Publishing a Page with a size and opening it on creds.id: the web change is committed
  locally only and not deployed. **Deploy web before any app build publishes a size** —
  older web readers reject the unknown `size` field (strict schema).
- Web rendering of sizes in a browser.
- Android.
- Request proof crash fix (bc6c2ecd) still needs the two-phone run.
