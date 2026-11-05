# Text block: one field + style choice — 2026-11-05

Change: the text block editor drops the separate 標題/內容 fields for one text box; the block's
title is derived from the first line (schema still needs one) and is not drawn as a heading for
text blocks (app preview + web PageBlocks). The 純文字/卡片 style picker, previously hidden for
text, is shown.

## Run (iOS sim iPhone 18 Pro, Debug dev client, branch 2.0.1)

| Step | Expected | Result |
|---|---|---|
| Fresh onboarding (@e2etextblk), add 文字 block, open editor | one text box, 樣式 chips, no 標題 field | PASS (1-editor-empty.png) |
| Type two lines, 純文字 | preview shows the two lines, no heading | PASS (2-plain.png) |
| Switch to 卡片 | preview becomes bordered centred card | PASS (3-card.png) |
| 儲存 | Page preview shows card, no section heading | PASS (4-saved-page.png) |

`bun run typecheck && bun run lint && bun run test`: exit 0 (1273 + 54 pass, 0 errors).

## Not run
- Web `PageBlocks.tsx` heading removal: typecheck only, not rendered in a browser.
- Empty-state hint in the editor preview (added after the run): not re-run.
- Android.

Side effect: a stray tap published the empty test Page creds.id/@e2etextblk.
