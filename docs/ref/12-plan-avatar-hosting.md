# 12 — Publishing a photo as the Page's picture (plan, 2026-10-30)

Status: **dropped 2026-10-30 — Kidney's call: no photo hosting.** A Page's picture is the one the owner picks from
their links / Bluesky (already built, signed into the Page, shown by other phones through `PageAvatar`). An album photo
stays on the phone, and the picker says so (`meEdit.avatar.libraryHint`). Kept for the record in case hosting comes
back. Still open: the web Page shows initials only (§1) — showing the signed picture there needs a first-party,
https-guarded image proxy like `/api/youtube/thumb`.

## 1. Today

- A Page's signed `avatar` (`packages/shared/src/profile.ts`) is a free-form string: URL or blob hash.
- The app can sign in a **remote** picture (Bluesky avatar, or a picture one of the Page's links serves). A photo from
  the album is saved **on this phone only** (`src/profile/localAvatar.ts`): nothing hosts it, so visitors and other
  phones see the initial.
- The app shows a Page's picture only through `publicHttpsUrl` (`src/components/people/PageAvatar.tsx`, 2026-10-30).
- The web Page (`airmeishi-web`) shows **initials only**: its CSP is `img-src 'self' data:` and YouTube thumbnails
  already come through a first-party proxy (`/api/youtube/thumb`). Any plan must keep images first-party there.

## 2. Proposal — a creds.id Blossom server, portable by design

Blossom (github.com/hzrd149/blossom, NIP-B7): blobs addressed by sha256, `PUT /upload` authorised by a signed Nostr
event (kind 24242), `DELETE /<sha256>`, `PUT /mirror`, user server list (kind 10063). The owner's Nostr key already
exists on every set-up phone, so no new account or credential is needed.

- **Host**: one Worker + R2 bucket on the kidney Cloudflare account (where the NIP-05 worker lives), answering BUD-01/02
  (`GET|HEAD /<sha256>`, `PUT /upload`, `DELETE /<sha256>`), served under `https://creds.id/blob/<sha256>` so the web
  Page stays `img-src 'self'`.
- **What the Page signs**: `avatar: "https://creds.id/blob/<sha256>.jpg"`. Content-addressed: anyone can check the
  bytes against the hash, and any Blossom server holding the same blob serves the same picture.
- **North star (company dies, Page still works)**: the phone keeps the original; the Page degrades to the initial if
  creds.id is gone, and the owner can mirror to any Blossom server (kind 10063) and re-sign the URL. Optional later:
  mirror to one public server at upload time.

### Upload path (app)

1. Pick photo → crop square → **re-encode on device** to 512×512 JPEG, quality ~0.8, target ≤ 150 KB
   (`expo-image-manipulator`). Re-encoding drops **all EXIF, GPS included** — this is the privacy gate, not optional.
2. sha256 the bytes; sign kind 24242 (`t=upload`, `x=<sha256>`, short `expiration`) with the Page's Nostr key.
3. `PUT /upload`; server re-hashes, checks size + JPEG/WebP magic bytes, stores by hash, records the uploader pubkey.
4. Sign `avatar` into the record and publish (existing `commitProfile` path).
5. Old picture: `DELETE /<old sha256>` with a kind-24242 `t=delete` token, so one owner holds one live picture.

### Server rules

- Accept only: valid 24242 for `upload`, unexpired, pubkey = a **registered creds.id name's** Nostr key (NIP-05
  directory lookup) — stops anonymous dumping; ≤ 256 KB; JPEG/WebP magic bytes; one live blob per pubkey (a new upload
  replaces the old).
- `GET` sets `Content-Type` from magic bytes, `Cache-Control: public, max-age=31536000, immutable`,
  `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, CSP `default-src 'none'` on the blob response.
- Takedown: a `PUT /report` (BUD-09) intake + a script that deletes a hash and blocks its re-upload.

## 3. Decisions for Kidney (recommended first)

1. **Host** — (a) own Blossom on R2 under creds.id ✅ / (b) public Blossom servers only (free tiers unstable, web needs
   a proxy to arbitrary hosts) / (c) both from day one.
2. **Who may upload** — (a) any registered creds.id name ✅ / (b) Pro only.
3. **Moderation** — (a) report intake + manual takedown by hash, one picture per owner ✅ / (b) also automatic
   image scanning (a vendor such as Cloudflare CSAM scanning; must be enabled on the zone before launch).
4. **Old phones with a local-only photo** — (a) ask once 「要把這張照片發佈到頁面嗎？」 ✅ / (b) leave them local.

## 4. Phases (each ends with a real run)

- **P1 server**: Worker + R2, BUD-01/02 + delete + report; unit tests on the 24242 verifier and the size/type gate
  (security seam → `tdd`). E2E: curl upload/get/delete with a test key.
- **P2 app**: resize/strip, upload, sign `avatar`, delete old. E2E on a real phone: pick photo → publish → second
  phone sees it in Contacts → EXIF absent in the served bytes (`exiftool`).
- **P3 web**: `ProfileCard` renders `avatar` only when it is `https://creds.id/blob/<64 hex>`; OG image uses it.
- **P4**: optional mirror to a public Blossom server; kind 10063 list.

## 5. Not in scope

Video, galleries, link thumbnails hosting, end-to-end encrypted media.
