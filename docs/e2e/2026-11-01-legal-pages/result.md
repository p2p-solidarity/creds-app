# Legal pages restructure + open-source licenses — 2026-11-01

## What changed
- Legal source (airmeishi-web `src/content/legal/`) is now intro → key points → parts → numbered
  sections with subheadings and bullet lists. Same legal text; privacy sections regrouped into
  4 parts (cross-references renumbered). Terms §9 adds third-party open-source components
  (incl. the right to modify / relink / reverse-engineer that a license grants — LGPL jmrtd/scuba).
- `bun scripts/export-legal-documents.ts` (was export-legal-markdown) writes the app's
  `src/legal/documents.ts`; the app renders it as cards (`LegalDocumentView`), Markdown renderer deleted.
- Settings → About is a `SettingsBlockSection` (rounded card) with Replay onboarding, Privacy,
  Terms (new), Open-source licenses (new), Version.
- `scripts/export-licenses.ts` → `src/legal/licenses.json` from the real bundle (expo export source
  maps + Pear worklet bundle + autolinked native packages), Podfile.lock pods, the Android release
  runtime classpath, and the Rust crates linked into libsemaphore_bindings (iOS + Android targets,
  proc-macros excluded). Counts: JS 166, iOS 22, Android 297, Rust 294, fonts 2.

## Run for real (iPhone 18 Pro sim, iOS 27, Metro dev)
- 01 Settings → About as a rounded card with 5 rows.
- 02/03 Privacy policy: key points card, part label, section cards with subheadings.
- 04 Open-source licenses list. 05 Terms top. 06 jmrtd detail (LGPL-2.1 text). 07 Privacy in dark mode.
- Web: localhost:5732/privacy renders 4 parts / 16 sections / 22 subheadings / 9 lists.
- `bun run typecheck && bun run lint && bun run test`: green (1501 + 73 pass, 0 lint errors).

## Not run / known gaps
- Android device not run; release build size impact of the 1.6 MB licenses.json not measured.
- Last licenses.json run predates the "Android row link = POM project URL" fix (rows link to the
  license URL; https ones only). Re-run the exporter after `pod install` — another session's
  `prebuild --clean` removed ios/Pods mid-session.
- Rows with no license text (JS 18, iOS 7, Android 79, Rust 4) show "ships no license file" honestly;
  mostly MIT packages that publish no LICENSE file, and Maven MIT/BSD/Google-terms artifacts.
- No legal review of the text; no controller legal entity / postal address in the privacy policy.
