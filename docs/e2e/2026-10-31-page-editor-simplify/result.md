# Page editor simplify — 2026-10-31

iPhone 18 Pro simulator, dev client + Metro from `apps/expo` (hot reload, then app relaunch for the new i18n strings).

## Ran
- 1-header-plus-count.png — 區塊 group header shows `1/6` and a ＋; no bottom 「＋ 新增區塊」.
- 2-preview-clean.png — Page preview paints like the public Page: no dashed frame, no ↑ ↓ 👁 🗑.
- 3-sections-only-add-sheet.png — header ＋ opens 「新增區塊 1/6」: only 音樂 / 表單 + section types (no links, platforms, import, proof).
- 4-block-editor-sheet.png — tapping the 音樂 block opens its editor: 取消 / 編輯區塊 / 儲存 top bar, one tool row 上移 下移 隱藏 移除 (上移/下移 disabled with one section), item trash inline, items `1/24`.
- 5-hidden-block-dimmed.png — 隱藏 applies at once; back on the Page preview the block is dimmed with 「已隱藏」 and still tappable. Restored with 顯示 afterwards (draft back to published, publish card gone).

- 6-drag-reordered.png — long-press a block in the preview and drag: 作品集 moved above 文字aaa, no editor opened; dragged back down afterwards. 上移 / 下移 from the sheet also checked with three sections (order restored to 音樂, 文字aaa, 作品集).

- 7-present-online.png / 8-present-offline-physical-card.png — 出示 tab: 翻面 / 訂製實體卡 button pair gone (tap the card to flip), 線上 | 離線 is a small toggle on the QR plate, one small 訂製實體卡 button under it; 離線 switches the code.
- 9-physical-card-sheet.png — 訂製實體卡 sheet: ✕ header, live card in the chosen material with only the engraving that is on, material chips, one grouped toggle list. 黃銅 repaints the card; set back to 不鏽鋼.
- 10-empty-card-style.png — an empty 文字 block in 卡片 style now draws the card panel with the hint inside (was invisible, so 卡片 looked like no change). Cancelled without saving.

- 11-rounded-page-cards.png — cream / ink / journal Page cards are 12px rounded (were 0), same change in airmeishi-web `pageAppearance.ts` (web typecheck + 239 tests green).

## Not run
- 移除 from the sheet, the 6-section cap reached in the UI (cap covered by `pageDesign.test.ts`), dark mode, Android.
