# 2026-10-31 — No empty band at the top of pull-up sheets

## Reported
Some pull-up sheets opened with a large blank area above their header.

## Root cause
Eight sheets were bare RN `Modal` (`pageSheet` / `formSheet`) padding their top by the window's safe-area
inset, read outside the sheet. An iOS sheet already starts below the status bar, so that inset (~59 pt)
became an empty band. Ten more sheets already used `ModalSheet` but padded by a window inset read outside it.

## Fix
- Bare Modals → `ModalSheet` (nested SafeAreaProvider): PhysicalCardSheet, ReceivedCardSheet,
  ProofPresentationFlowSheet, VerifierResultSheet, VerifiedPageResultSheet, AvatarPickerSheet,
  DeleteContactsSheet, ContactsActivitySections.
- `sheetTopInset(windowTop)` (0 on iOS, window inset on Android) for every sheet that reads the inset
  outside its own provider: the above plus InfoSheet, LinkPageImportSheet, PageBioSheet, ProfileSectionsList
  block editor, PageAppearanceSheet, AddLinkSheet, PageAddSheet, ManualContactEntrySheet, passkey detail.

## Ran for real (iPhone 18 Pro sim, dev client)
- `01` before: 個人照片 sheet with a ~60 pt blank band above the title.
- `02` after: title sits at the sheet's top edge.

## Not run
- Each of the other 17 sheets individually; Android (helper keeps the window inset there).
