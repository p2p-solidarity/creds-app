# Fonts

The Solid(ar)ity / creds.id type from the Figma file: **DM Sans** for headings,
**Inter** for text. Static TTFs from `@expo-google-fonts/dm-sans` and
`@expo-google-fonts/inter` 0.4.2, renamed to their PostScript names so the same
`fontFamily` string works on iOS (PostScript name) and Android (file name) once
`expo-font` embeds them at build time (app.json). Picked per weight in
`src/constants/fonts.ts`.

Both are licensed under the SIL Open Font License 1.1 — Inter © The Inter
Project Authors (github.com/rsms/inter), DM Sans © The DM Sans Project Authors
(github.com/googlefonts/dm-fonts).
