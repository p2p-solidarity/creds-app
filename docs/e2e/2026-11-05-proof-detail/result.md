# Proof detail cleanup — sim run 2026-11-05

Branch `claude/proof-detail-cleanup-9b81e4`. iPhone 18 Pro sim (793562A3), existing debug dev client, Metro from this worktree on :8081.

## Change
- `apps/expo/app/credentials/[id].tsx`: claim rows are plain read-only rows for every proof type (checkbox, `selectedClaimIDs` state and `toggleClaim` removed). "Present proof" presents all of the proof's claims (or only `claimId` when the developer tools pass one).
- Text under 包含項目 removed: the "Present this QR… Only selected disclosures are included." footer (dev mode) is off, and the section is hidden when the proof has no claim rows (it used to print 「沒有可顯示的詳細資料。」).
- Remove/re-add action and its confirm kept. No i18n key became unused.

## Run
| Step | Expected | Verdict |
|---|---|---|
| Dev mode on (5× 版本) → 設定 › VC 管理 › 建立 did:key 憑證 → open Business Card | detail opens | PASS (01, 02) |
| 包含項目 on a proof with no claim rows | no section, no explanatory text | PASS (02; 01 = before hiding) |
| 移除後重新加入 | confirm 「移除證明？」 appears; cancelled | PASS (03) |
| Claim rows render without checkboxes | rows only, no checkbox | UNVERIFIED on device — no claim-bearing proof can be made on a sim |

## Not run
- A proof with claim rows: only passport scans (NFC) and proofs received over NIP-17 create claim rows; neither is possible on the sim. Covered by code read + typecheck only.
- Android.

Screenshots (gitignored) sit next to this file locally.
