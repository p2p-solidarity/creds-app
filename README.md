<div align="center">

<img src="./apps/expo/assets/icon.png" width="140" alt="creds.id app icon" />

<h1>creds.id</h1>

<p>
<strong>A verified page and card that you own outright.</strong><br />
Local-first, no server in the trust path — if creds.id disappeared tomorrow, every page and every
check it ever produced would still verify.
</p>

[![License: Apache 2.0](https://img.shields.io/github/license/p2p-solidarity/creds-app)](./LICENSE)
[![Version 2.0.0](https://img.shields.io/badge/version-2.0.0-2b6cb0)](./apps/expo/app.json)
[![Platforms](https://img.shields.io/badge/platform-iOS%2017%2B%20%C2%B7%20Android%2010%2B-4a5568)](#build--release)

[creds.id](https://creds.id) · App repo `p2p-solidarity/creds-app` (this one, historically `airmeishi`) ·
Web repo [`p2p-solidarity/creds-web`](https://github.com/p2p-solidarity/creds-web)

</div>

---

## What is creds.id?

A **Page**: a Linktree you hold the keys to. Every link and handle on it is either checkable by any
stranger or honestly labelled as an unverified claim. The app holds the keys and signs; the web
page at `creds.id/@name` is a static, replaceable renderer.

**North star — "the company dies, the page still works."** Your data lives on your device and in
_your_ cloud (iCloud Drive / Google Drive), the Page is published to open networks (Nostr, atproto,
a URL fragment), and verification runs on the reader's own client.

### Five user stories (the whole main line)

1. **Create** — make a creds.id identity with a passkey, without ever managing keys or DIDs.
2. **My Page + verify** — add X / GitHub / Telegram / a website; tap verify, paste one marker into
   the platform's bio, come back, get a green check.
3. **Show** — open one card with a QR; whoever scans it sees the Page and every check on it.
4. **Collect people** — scan someone (or exchange over Pear); People re-checks their signatures and
   attestations on your phone.
5. **Prove** — scan a passport once and the Page gains a passport badge.

Second tier, off the main line: credential wallet, OIDC, websign, Settings.

### Product principles

1. **No server in the trust path.** creds.id runs a few small services — NIP-05 names, a
   ciphertext-only passkey vault, the Pro license bridge and an optional Pro witness — and none of
   them is needed to read or verify a Page.
2. **A green check means _control_, not identity.** It says "this person controls that account /
   domain / key right now" — never that they're famous, honest, or who they claim to be.
3. **Honest labels.** A badge says exactly who vouched for it and how; a lower tier is never shown
   as a higher one.
4. **One click to the evidence.** Every badge is at most one tap from what backs it.
5. **Key lifecycle is the one place we don't go light.** Recovery is a day-one requirement.

### Three tabs

| Tab         | Route               | What it does                                                                        |
| ----------- | ------------------- | ----------------------------------------------------------------------------------- |
| **Page**    | `app/(tabs)/me`     | Your Page — add a link (saved on add), verify it, edit appearance, publish.         |
| **Present** | `app/(tabs)/verify` | One card, two QR forms; scan someone else's Page.                                   |
| **People**  | `app/(tabs)/people` | People you've saved — snapshots plus quiet re-verification when their Page changes. |

---

## How it works

### Identity and keys

- **One root identity.** A BIP-39 mnemonic → HKDF → a **P-256 `did:key`**, plus a secp256k1 Nostr
  key (`npub`) from the same seed. Same mnemonic, same identity in the app and on the web
  (`packages/shared/src/derive.ts`). Everything public — the Page, the card — is signed by the root.
- **Passkey on top, mnemonic underneath.** A WebAuthn PRF passkey wraps the seed in a
  ciphertext-only vault, so signing in on `creds.id` is one passkey touch and the user never sees a
  mnemonic or DID. The mnemonic stays the only root; without PRF the user re-enters the phrase.
  Page content syncs through Nostr, not through the vault ([`docs/ref/08`](./docs/ref/08-plan-passkey-root-sync.md)).
- **Signing is gated by Face ID.** Default mode is `redLineOnly`: irreversible actions — key
  rotation, revealing the recovery bundle, deleting a ZK identity, releasing a card over Pear —
  prompt every time; showing your own card never prompts
  (`apps/expo/src/keychain/sensitiveActionPolicy.ts`).
- **Terminology is deliberately narrow** — Recovery Phrase, Root Identity, Signing Identity, Device
  Storage Key, Portable Backup Key, Backup Archive are six _different_ things. See
  [CONTEXT.md](./CONTEXT.md) before writing anything that says "key".

### Publishing surfaces

| Surface               | Shape                                                                                         | Needs                                           |
| --------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Nostr**             | NIP-78 replaceable event, `kind 30078`, `d = solidarity.profile`, plus `kind 0` `alsoKnownAs` | A keypair. No account. Default home.            |
| **atproto / Bluesky** | Record `app.solidarity.profile` (rkey `self`) in your own PDS, via atproto OAuth              | A Bluesky account                               |
| **URL fragment**      | Signed profile → raw-deflate → base64url after `#`                                            | Nothing — the fragment never leaves the browser |
| **NIP-05 name**       | `name@creds.id`, registered with a NIP-98 signed request; gives `creds.id/@name`              | Only for the human-readable handle              |

`creds.id` is the product host and default share origin. `solidarity` names in record types, URL
schemes, keychain services and SKUs are legacy identifiers kept so existing users' data still
resolves; `solidarity.gg` hosts stay valid for deep links and atproto OAuth client metadata.

### Social verification — local first

The badge always shows the strongest layer the viewer can reach
([`docs/ref/10`](./docs/ref/10-plan-simplify-and-verify.md) §3.11):

| Layer                     | Who vouches                                                         | For                           |
| ------------------------- | ------------------------------------------------------------------- | ----------------------------- |
| 1. Platform signature     | The platform's own key                                              | Bluesky, Nostr                |
| 2. Issuer chip            | The issuing state (passive authentication)                          | Passport                      |
| 3. Device attestation     | A hardware key backed by Apple App Attest / Android Key Attestation | X, Telegram, GitHub, websites |
| 4. The viewer's own fetch | The viewer's phone, checking the public page itself                 | Same, live inside the app     |

- **Verify flow:** tap verify → "copy and open" puts `creds.id/@name` on the clipboard and opens the
  platform → paste it into the bio → back in the app the phone fetches the public page, finds the
  marker and signs the result with its attested device key → "add green check" signs the Page once.
- **P2P witnesses:** after a viewer's own check passes, they can tap "witness for @them" — a public
  statement signed by their npub plus their phone's device attestation. Only published on an
  explicit tap. The owner can never witness themselves.
- **Honesty about what attestation proves:** it proves "a genuine creds app on a real phone", not
  "a distinct person" — one phone can mint many keys. Only the passport nullifier counts distinct
  people. Badges say "checked by the creds app on a real phone", never "unforgeable".
- **Pro creds.id witness:** Pro users can add creds.id itself as one more witness (it fetches the
  page and signs with its own npub, same format). It is never on anyone's required path.
- Verification is pure TypeScript in `packages/shared/src/deviceproof`, offline, shared by app and
  web. Re-checks run in the background every 30 days, on the owner's phone, for free.

Handle resolution (atproto, DNS `_did.<domain>` over DoH, ENS, NIP-05) also lives in
`packages/shared`, each with a reverse-binding check — a one-way claim never earns a green check.

### One card, two QR forms

Present shows a single card, which is just a projection of the signed Page:

- **Online** — `creds.id/@name` (falls back to a short Nostr link when there is no name).
- **Offline** — a fragment URL carrying name, links and DID only.

Scanners accept Page URLs and fragments. Older card wires (CRD1 and before) are still decoded for a
transition release; the chunked `sqc1` QR survives only for websign. Wire details:
[`docs/ref/05-spec-qr-exchange.md`](./docs/ref/05-spec-qr-exchange.md).

### Passport (on device, no circuit)

MRZ scan → NFC chip read → passive authentication on the phone → a statement (nullifier, npub,
disclosed predicates) signed by the attested device key. The app no longer proves anything about
a passport in a ZK circuit ([`docs/ref/11`](./docs/ref/11-plan-passport-openac.md)):

- **L3** — passive auth + device-attested statement.
- **L2** — passive auth on this phone only.
- **L1** — unverified. ZK-era passport records display L1 and ask for a rescan.

Chip signatures (AA/CA) are not enforced, and the badge detail says so.

### Pro

One annual auto-renewable IAP. Pro v1 = advanced Page sections, custom fonts and background, brand
off with your own footer, and the creds.id witness. A license bridge checks the purchase with Apple
/ Google and issues a DID-bound license JWS that creds.id honours
([`docs/ref/09`](./docs/ref/09-plan-pro-entitlement.md)).

### Other pieces

- **Websign** — build a Page on a keyboard, sign it with the phone: the phone shows a per-field
  diff, then Face ID signs. Now the fallback when passkey PRF is unavailable.
- **Pear lane** — app-to-app private channel (Bare worklet + Hyperswarm, topic = hash(DID),
  Noise-encrypted). Private channels only — the public Page never goes through Pear.
- **Backup** — Backup Archives are encrypted with a key derived from the Recovery Phrase and written
  to **your** cloud (iCloud Drive Documents / Google Drive). Restore = phrase + archive.
- **Account deletion** — every server-side delete is signed by the account key; server first, then
  the local wipe.

### What we deliberately don't do

No inbox, no chat, no scores, no chain, no centralised badge database, no zk-email, and no claim of
"unique human" beyond what a passport nullifier honestly counts. A Page that could only be read
through our domain would fail the north star.

---

## Repository layout

A Bun workspaces monorepo. **The app is `apps/expo/`.**

```
creds-app/
├── apps/expo/            ← the app: Expo Router + React Native + TypeScript
├── packages/
│   ├── shared/           ← pure-TS crypto, wire formats, verifiers (app + web + workers share it)
│   └── parity-fixtures/  ← FROZEN golden vectors — never edit, never regenerate
├── nitro-modules/
│   ├── attest/           ← @solidarity/nitro-attest — MrzOcr · NfcPassport · Semaphore · DeviceAttest
│   └── keystone/         ← @solidarity/nitro-keystone — SecretsVault · SpruceDid · CloudKit
└── docs/ref/             ← the live specs and plans (see "Where truth lives")
```

`packages/shared` is why app and web agree: DID/JWT primitives, canonical JSON, JWS, seed
derivation, the root vault, device-proof verification, QR codecs, fragment encoding, handle
resolvers and badge verification, Nostr event build/verify, the NIP-05 client — plus the
conformance vectors both ends must reproduce. The web repo vendors it as a packed tarball, so
**bump the version and re-pack whenever you change it**.

Keychain service names and AndroidKeyStore alias prefixes were **not** renamed in the Nitro
consolidation or the rebrand — they address existing users' keys.

<details>
<summary><strong><code>apps/expo/src</code> module map</strong></summary>

| Area              | Modules                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Identity & keys   | `identity` · `keychain` · `storage` · `account`                                                               |
| Page & card       | `page` · `me` · `cards` · `profile` · `present` · `disclosure`                                                |
| Publish & resolve | `nostr` · `atproto` · `handles` · `nip05` · `domains` · `badges`                                              |
| Verification      | `witness` · `passport` · `credentials` · `oidc` · `zk` · `groups`                                             |
| Exchange          | `scan` · `sharing` · `deeplink` · `websign` · `pear`                                                          |
| Data              | `contacts` · `people` · `vault` · `backup`                                                                    |
| Shell             | `components` · `constants` · `navigation` · `onboarding` · `settings` · `pro` · `i18n` · `feedback` · `legal` |

</details>

### The web side

[`p2p-solidarity/creds-web`](https://github.com/p2p-solidarity/creds-web) serves `creds.id`: the
viewer (`/@name`, `#fragment`, `#nostr:<npub>`) and the Page editor. Sign in with a passkey, edit,
publish straight to Nostr — no mnemonic, DID or key UI on the web. It verifies with the same
`packages/shared` code as the app, including device attestations and witnesses.

---

## Development

### Prerequisites

- **Bun 1.3.14** (pinned via `packageManager`) and Node ≥ 20.18
- **Xcode** for iOS — deployment target 17.0, developed and tested against iOS 26
- **Android SDK** with `minSdk 29`
- A physical phone for NFC passport reading and anything in the witness / device-key path (App
  Attest does not exist on simulators)

`bunfig.toml` pins `linker = "hoisted"` — Metro can't traverse Bun's default symlinked layout.

### Quick start

```bash
git clone git@github.com:p2p-solidarity/creds-app.git
cd creds-app
bun install
```

```bash
cd apps/expo
bunx expo prebuild --clean --platform ios --no-install
bun run ios          # builds + installs the dev client, launches the simulator
```

Expo Go is not a development path: the app ships Nitro modules and a vendored `BareKit.xcframework`.
Build a dev client once per native dependency change, then use `expo start` for the JS loop.

### Verify — run this before claiming anything works

```bash
bun run typecheck && bun run lint && bun run test
```

| Script              | What it runs                                                       |
| ------------------- | ------------------------------------------------------------------ |
| `bun run typecheck` | `tsc --noEmit` over `apps/expo`                                    |
| `bun run lint`      | ESLint across the workspace (`lint:strict` for `--max-warnings 0`) |
| `bun run test`      | unit tests + golden-vector parity for `apps/expo`                  |
| `bun run format`    | Prettier over `ts,tsx,js,jsx,json,md`                              |

`packages/shared` carries its own suite — `cd packages/shared && bun test`. Parity fixtures are
**frozen**: the generator was deleted with the old Swift app, so they can never be regenerated.

Evidence of what actually ran on a simulator or device lives in `docs/e2e/<date>-<slug>/result.md` —
check its "Not run" list before claiming a feature works.

### Build & release

- **iOS** ships through **Xcode Cloud**. The `withXcodeCloudScripts` config plugin recreates
  `ios/ci_scripts/ci_post_clone.sh` after every `expo prebuild --clean` from
  `apps/expo/ci-scripts/ci_post_clone.sh`. `-skipPackagePluginValidation` is required by SPM plugin
  validation.
- **Android** builds via `expo prebuild --platform android` + `./gradlew bundleRelease` and ships
  on Google Play.
- Identifiers: iOS `kidneyweakx.airmeishi`, Android `gg.solidarity.app`. URL schemes `credsid://`,
  `solidarity://`, `airmeishi://`, `openid-credential-offer://`. Associated domains `creds.id`,
  `solidarity.gg`, `app.solidarity.gg`.
- `.github/workflows/release.yml` cuts a GitHub release when a `1.*`/`2.*` release PR merges to
  `main` (or on manual dispatch).

---

## Where truth lives

Read in this order. `docs/ref/` is written in Traditional Chinese; code, comments and this README
are in English.

1. **[`CLAUDE.md`](./CLAUDE.md)** — repo guide and hard rules.
   **[`apps/expo/CLAUDE.md`](./apps/expo/CLAUDE.md)** — the coding rulebook. Mandatory before
   editing anything under `apps/expo/`.
2. **Live plan** — [`docs/ref/10`](./docs/ref/10-plan-simplify-and-verify.md): five user stories and
   local-first social verification (§3.11). Its zkTLS / notary-evidence sections are retired
   history. [`11`](./docs/ref/11-plan-passport-openac.md) (passport, no circuit) and
   [`12-plan-ui-rebrand`](./docs/ref/12-plan-ui-rebrand.md) (creds.id rebrand, one card) take over
   pieces of 10.
3. **Built mechanisms** — [`08`](./docs/ref/08-plan-passkey-root-sync.md) passkey root vault,
   [`09`](./docs/ref/09-plan-pro-entitlement.md) Pro entitlement,
   [`05`](./docs/ref/05-spec-qr-exchange.md) QR wires,
   [`06`](./docs/ref/06-plan-convergence-2.0.0.md) 2.0.0 north star and keep/cut.
4. **Background** — `docs/ref/01–03` (Verified Page spec). `04` and
   `notes-archive-pre-2.0.0.md` are history.

> **Stale by design:** `spec.md` and `architecture.png` describe the deleted SwiftUI app. Root
> `ios/`, `android/`, `app.json`, `solidarity.xcodeproj/` and `ci_scripts/` are leftover artifacts —
> the real native projects are `apps/expo/{ios,android}`, regenerated by prebuild.

### History

This repo started as **airmeishi**, then **Solid(ar)ity**, a SwiftUI business-card app; the SwiftUI
app was deleted on 2026-06-27 (`3fd308e`) and the product now ships as **creds.id**. Gone along the
way: MultipeerConnectivity proximity exchange, CloudKit group sync, the Sharing tab, the card form
and card-only wires, in-app passport ZK proofs, and the zkTLS / TLSNotary notary. Group / Semaphore
membership is frozen. Names like `solidarity/Views/...` or `Color.Theme.*` in old docs are
historical.

---

## Security

Contributions touching these paths are reviewed as high-risk changes:

- `apps/expo/src/{passport,keychain,identity,vault,witness}`,
  `packages/shared/src/{deviceproof,rootVault.ts,pro}` and `nitro-modules/{attest,keystone}`.
- Errors on security paths use tagged unions — never thrown raw, never swallowed, never logged with
  PII.
- Red-line Face ID actions deliberately bypass the biometric grace window. Adding a grace period
  there is a regression, not an optimisation.
- A Nitro `ArrayBuffer` argument from JS is **non-owning**: reading `.data` / `.size` inside
  `Promise.async` is an uncatchable native crash. Copy the bytes synchronously first.
- Any URL the phone fetches on someone's behalf (website checks, link thumbnails) goes through the
  https-only / no-private-IP guard in `apps/expo/src/profile/httpsOwnership.ts`.
- Never commit `apps/expo/secrets/`, any `.env*`, or `apps/expo/infra/terraform/terraform.tfstate*`
  / `terraform.tfvars`.

Found a vulnerability? Please report it privately through GitHub's security advisories on this
repository rather than opening a public issue.

---

## Built with

[Expo](https://expo.dev) · [React Native](https://reactnative.dev) ·
[Nitro Modules](https://github.com/mrousavy/nitro) · [Expo Router](https://docs.expo.dev/router/introduction/) ·
[NativeWind](https://www.nativewind.dev) · [Reanimated](https://docs.swmansion.com/react-native-reanimated/) ·
[MMKV](https://github.com/mrousavy/react-native-mmkv) · [Bare](https://github.com/holepunchto/bare) / [Hyperswarm](https://github.com/holepunchto/hyperswarm) ·
[Semaphore](https://semaphore.pse.dev) · [SpruceID](https://spruceid.com) ·
[Nostr](https://github.com/nostr-protocol/nips) · [atproto](https://atproto.com)

## License

Apache 2.0 — see [LICENSE](./LICENSE). Also: [Privacy Policy](./PRIVACY_POLICY.md) ·
[Terms of Service](./TERMS_OF_SERVICE.md).

---

<div align="center">
<strong>creds.id</strong> — a page that outlives the company that built it.
</div>
