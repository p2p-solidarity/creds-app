# credsid:// URL scheme — 2026-10-30

iPhone 18 Pro simulator, fresh dev-client build (`expo run:ios --scheme solidarity`), Metro on 8081.

## Ran
- Installed app Info.plist `CFBundleURLSchemes` = credsid, solidarity, airmeishi, openid-credential-offer, kidneyweakx.airmeishi.
- `simctl openurl credsid://websign?req=aaa.bbb.ccc`: iOS asks to open in creds.id, and the app lands on the 簽名請求 review with the honest decode error (`credsid-websign.png`).
- Relaunch + `solidarity://websign?req=legacy.scheme.check`: same review screen, so the legacy scheme still routes (`solidarity-legacy-websign.png`).
- Before the `+native-intent` fix, every app-scheme route (websign/card/pear) also hit Expo Router's "Unmatched Route" (`before-unmatched-route.png`). This was already true for `solidarity://` before this change.

## Not run
- Android (manifest edited by hand to match app.json; not built).
- `credsid://card|pear/…` on device (covered by the parser unit test only).
- Web still emits `solidarity://websign` on purpose; switch after a credsid-aware app build ships.
