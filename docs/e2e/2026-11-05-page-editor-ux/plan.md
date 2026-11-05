# Plan — Page editor UX (2026-11-05)

Device: shared iPhone 18 Pro sim (iOS 27.2), debug build `kidneyweakx.airmeishi`, JS from this worktree's Metro on :8081.
Baseline: screenshot of 頁面 tab before any edit (`B-0`). No remote publish: publishing to relays is not part of these cases.

| ID | Goal | Steps | Expected | Verified at |
|---|---|---|---|---|
| S1 | Sheet has no 上移/下移/隱藏/移除 | tap a section in the 區塊 preview | editor sheet opens with pinned preview at top, no tool row | screenshot |
| S2 | Long-press drag reorders | long-press a section, drag down past next, release | order of sections in preview swaps | before/after screenshots |
| S3 | Swipe left asks to remove | swipe a section left ≥ 90pt | red strip while swiping; confirm dialog 「移除「X」？」; cancel keeps it | screenshots |
| S4 | Confirm removes | repeat S3, confirm | section gone, count n-1/16, publish card shows pending | screenshot |
| S5 | 區塊 header has no fold | look at header | no chevron; preview always visible | screenshot |
| D1 | Leave warning | Me › Edit, change bio, tap ✕ | dialog 「尚有變更未發布」 with 先離開 / 繼續編輯 | screenshot |
| D2 | Draft restored | choose 先離開, reopen Edit | banner 「接著上次還沒發布的草稿。」 + bio keeps the edit | screenshot |
| D3 | Discard draft | 捨棄草稿 → 捨棄 | bio back to published; reopen shows no banner | screenshot |
| L1 | Link tile = Page tile | open add-link with an X URL; compare with preview card | both draw the brand tile (no fetched pfp) | screenshot |
| BG1 | Background mint reaches preview | 設計 › 背景 › 薄荷 | appearance preview + 區塊 preview ground mint | screenshot + pixel |
