# 2026-10-31 — Blocks are edited on the page itself

## Reported
Adding / removing 區塊 felt indirect, not WYSIWYG.

## What was wrong
- A new block has no items and the preview skipped empty blocks, so adding one changed nothing visible.
- Blocks were a separate list (drag handle + switch); the page preview sat folded behind its own row.
- Remove was the last button of the edit sheet.

## Change
- 區塊 now shows the Page preview as the editor (`PageLivePreview` `editing`): every non-links block gets a
  dashed frame with ↑ ↓ (move), 👁 (hide/show) and 🗑 (remove, confirmed); tapping the block opens its editor.
  Empty blocks show 「點這裡加內容」 where they will appear; hidden blocks stay dimmed with 「已隱藏」.
- 「＋ 新增區塊」 under the page opens the tab's add sheet; adding a section unfolds 區塊.
- Visitors' renders (`variant="public"`, Design sheet) are unchanged — they never pass `editing`.

## Ran for real (iPhone 18 Pro sim, dev client)
- `01` — 區塊 open: header, links, the 音樂 block framed with its toolbar and Spotify card, 「＋ 新增區塊」.

## Not run
- Move / hide / remove / add taps end to end (sim tap driving was dropping taps this session); Android; dark.

## Block editor: live card first (same day)
- The edit sheet opens on `PageBlockPreview` — the draft block painted on the Page's own ground — then the
  style choice, then title and items. Every keystroke / style tap repaints the card.
- `02` — 音樂 block: Spotify card at the top, 大卡 / 清單 under it.
- Known limit: for a Spotify item both `featured` styles render the same player card, so the choice shows no
  change. Real small / medium / large sizes need a new style value in `packages/shared` profile schema and the
  web renderer (`airmeishi-web` PageBlocks) — not done, waiting on a product call.
