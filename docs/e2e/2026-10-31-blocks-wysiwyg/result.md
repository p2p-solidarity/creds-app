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
