/**
 * Generated from airmeishi-web `src/content/legal/` (also served at
 * creds.id/privacy and creds.id/terms). Do not edit by hand — change the web
 * source and run `bun scripts/export-legal-documents.ts <this folder>` there.
 */
/* eslint-disable max-lines -- generated, one file on purpose */
import type { LegalDocuments } from './types';

export const LEGAL_EFFECTIVE_DATE = "2026-11-01";
export const LEGAL_CONTACT_EMAIL = "gm@solidarity.gg";

export const LEGAL_DOCUMENTS: LegalDocuments = {
  "en": {
    "privacy": {
      "intro": "This policy explains how creds (creds.id), provided by the Solid(ar)ity project (“we”), handles information when you visit, publish a page, use the creds app, or contact us. The app shows this same policy. Local-first means some work and storage happen on your device; online features also use servers. The key points below are a summary; the numbered sections are the full policy.",
      "highlights": [
        "Identity keys are kept on your phone. The copy creds.id stores for passkey sign-in is encrypted and designed to be decrypted only on your device.",
        "What you publish (your page, checks, witnesses and passport statements) is public on Nostr relays, and copies others already hold cannot be recalled.",
        "A passport’s name, number, photo and other chip data are read and checked on your phone and are not sent to us or published.",
        "The website and the app have no advertising, visitor analytics or tracking scripts.",
        "Cloud backup is off by default; if you turn it on, encrypted copies go to your own iCloud Drive or Google Drive.",
        "You can delete your account in the app under Settings, or at creds.id/delete-account."
      ],
      "parts": [
        {
          "title": "About this policy",
          "sections": [
            {
              "id": "scope",
              "title": "1. Features and versions",
              "blocks": [
                "The information processed depends on the features you use. Viewing a page does not by itself create a name-directory entry, connect a passkey, publish a check, or enable mobile backups.",
                "Features differ by platform. The website supports public pages, creating an identity with a passkey, and passkey sign-in. The creds app, version 2.0 and later for iPhone and Android, adds the features described in sections 4 and 6 to 8. Earlier app versions, published under the Solid(ar)ity name, worked differently; this policy describes version 2.0 and later."
              ]
            }
          ]
        },
        {
          "title": "What happens to your information, by feature",
          "sections": [
            {
              "id": "public-content",
              "title": "2. Public pages and Nostr relays",
              "blocks": [
                {
                  "heading": "What becomes public"
                },
                "When you publish, the profile fields you include, such as your display name, bio, links and listed identities, become public together with public identifiers, signatures and signing times. A linked Nostr profile may also publish your creds.id name and identity binding. Checks and statements you choose to publish are public too; section 4 describes them. Do not publish information you want to keep private or information about others without authority.",
                {
                  "heading": "How pages are distributed"
                },
                "Public pages are distributed through public Nostr relays. Visitors and apps request public keys and events to retrieve and check pages; relay operators can see these requests and the connecting IP address.",
                "Others may copy, index or retain public content. Updating a page, closing a QR screen, signing out or requesting deletion does not recall copies already shared."
              ]
            },
            {
              "id": "directory",
              "title": "3. The name directory",
              "blocks": [
                "If you claim or manage a creds.id name, the directory processes:",
                {
                  "list": [
                    "the name and its public key",
                    "the relay list",
                    "status and timestamps",
                    "any rename or redirect information"
                  ]
                },
                "The public name lookup exposes the name-to-key binding and relay information. Reserved names and records of released names may be kept to prevent misuse or reassignment.",
                "Directory operation logs record registrations, releases and recoveries, including signed requests, and have a 90-day retention period. This period applies to operation logs, not to active or retained name records, public relay copies, or hosting logs."
              ]
            },
            {
              "id": "checks-witnesses",
              "title": "4. Link checks, witnesses and passport statements",
              "blocks": [
                {
                  "heading": "Checking a link"
                },
                "When the app checks a link on a page, your phone fetches that public profile or website itself and looks for the page owner’s creds.id marker. The site you check sees a request from your phone, including your IP address. Nothing is published unless you choose to.",
                {
                  "heading": "Green checks and witnesses"
                },
                "If you add a green check to your own link or tap “witness” on someone else’s page, the app publishes a signed statement to public Nostr relays. Anyone can then see that you checked that page. The statement contains:",
                {
                  "list": [
                    "the link checked and the creds.id name",
                    "the page owner’s public key and your own public key",
                    "when your phone looked",
                    "a device proof: an attestation from Apple (App Attest) or Google (Android Key Attestation) that a genuine creds app on real hardware made it"
                  ]
                },
                "Getting that attestation contacts Apple or Google. It shows a genuine app and device, not who you are, and it is not a count of distinct people.",
                {
                  "heading": "Passport statements"
                },
                "If you scan a passport with the app on a phone that has NFC, the chip is read over NFC and checked on your phone; the passport’s name, number, photo and other chip data are not sent to us or published.",
                "You may then publish a passport statement, signed by your device key, that says a chip passing passive authentication was read for your public key, whether the holder was over 18, and when it was read and signed. The app re-signs it about every 30 days. Only if you opt in to being counted does it include a passport nullifier, a value derived from the chip that the issuing state or anyone holding the chip data could compute and link to your public key.",
                {
                  "heading": "Copies and checking on the website"
                },
                "Published checks and statements are public copies like the rest of your page; replacing or withdrawing one does not recall copies others already hold. Pages viewed on the website check these statements in your browser; to check Android revocation, the website fetches Google’s public revocation list through creds.id."
              ]
            },
            {
              "id": "browser-storage",
              "title": "5. Browser storage and passkeys",
              "blocks": [
                {
                  "heading": "What the website keeps in your browser"
                },
                "The current website stores page drafts, draft ownership or source information, and language and theme preferences in local storage. Drafts can remain after you leave the page and are not an encrypted backup.",
                "Older web versions may also have left passkey-protected identity data in IndexedDB; the current sign-in flow does not create that local vault. If you create an identity on the website and its upload has not finished, a passkey-sealed copy waits in local storage until it is sent. Clearing site data removes local copies, not remote records or your passkey provider’s copies.",
                {
                  "heading": "Creating an identity and signing in with a passkey"
                },
                "When you create an identity on the website with a compatible passkey, such as one from Apple or Google, the recovery phrase is generated in the browser, sealed with key material from that passkey, and uploaded to creds.id as an encrypted root-vault record. When you sign in, the browser requests that record from an address derived from the passkey credential, decrypts it locally and uses the unlocked identity in memory to sign.",
                "Passkeys of one identity are linked by an owner index that lets you list, rename and remove them; creds.id stores the encrypted records, a passkey-derived index key and the passkey names you choose. A passkey provider may sync the passkey under its own settings and policy. Support cannot replace a lost recovery phrase or promise recovery from a lost passkey."
              ]
            },
            {
              "id": "mobile-vault",
              "title": "6. Mobile identity and the encrypted root vault",
              "blocks": [
                "In the creds app, identity material is kept in device secure storage. Connecting a passkey uploads an encrypted vault containing the recovery phrase and, where applicable, a Nostr signing key stored separately on the device, to creds.id. The service stores ciphertext and a passkey-derived storage address; decryption is designed to happen on your device using the passkey. This encrypted identity copy enables the web sign-in described in section 5 and is separate from a backup of contacts or cards.",
                "On iPhone, the app may also keep a recovery copy in iCloud Keychain. Device secure storage, iCloud Keychain and the creds.id root vault are distinct storage locations. Encryption reduces exposure; it is not a guarantee against every compromise or loss."
              ]
            },
            {
              "id": "mobile-backups",
              "title": "7. Optional mobile backups and other app features",
              "blocks": [
                {
                  "heading": "Cloud backup"
                },
                "Cloud backup in the app is off by default. If enabled, encrypted copies of cards, contacts, attestations, profile and page data go to your own iCloud Drive or Google Drive, depending on the platform, and may support device sync. These data backups exclude identity keys and require the relevant recovery material. On iPhone, a backup may remain in app storage when iCloud Drive is unavailable. Manage cloud copies through the relevant provider.",
                {
                  "heading": "Contacts, cards and the camera"
                },
                "If you use contact, card or attestation features, the app stores that information locally and processes selected information when you share or export it.",
                {
                  "list": [
                    "Refreshing saved public pages queries relays for their public keys, and the Recent Updates list is worked out on your phone.",
                    "Importing from your phone’s contacts reads them only after you grant permission.",
                    "The camera reads QR codes and a passport’s machine-readable zone on the device."
                  ]
                },
                "Device permissions and provider settings affect these optional features.",
                {
                  "heading": "Private card exchange (Pear)"
                },
                "Private card exchange connects your phone directly to the other person’s phone over a peer-to-peer network when you start or accept an exchange. The other phone and the network’s nodes see your IP address; the card you approve is sent only to that person. You can turn private exchange off in Settings."
              ]
            },
            {
              "id": "purchases",
              "title": "8. In-app purchases",
              "blocks": [
                "creds Pro, the app’s optional paid plan, is bought through the App Store or Google Play. The store handles payment and keeps your payment details; we do not receive them. To unlock Pro, the app sends creds.id your identity’s public identifier (did:key), your platform and the store’s purchase identifier, signed by your identity, and receives a short-lived license. creds.id checks that purchase with Apple or Google.",
                "With Pro, you can ask the creds.id notary to witness your page. The app sends it your signed public page, its name and your license; the notary fetches your linked public profiles itself and publishes its own statement to public relays, as described in section 4."
              ]
            },
            {
              "id": "support",
              "title": "9. Support messages and error reports",
              "blocks": [
                {
                  "heading": "Email to support"
                },
                "If you email gm@solidarity.gg, we and our email provider process your email address, message, attachments and related correspondence to answer and handle your request. Send only what is needed. Never send a recovery phrase, private key or passkey secret. Correspondence is kept as needed for support, security and applicable legal obligations.",
                {
                  "heading": "Error reports"
                },
                "When something fails, the app can draft an error report email to err@solidarity.gg. Nothing is sent unless you send it from your mail app, and you can read and edit it first. The draft contains:",
                {
                  "list": [
                    "the error message, code and technical trace",
                    "the app version, your platform and system version",
                    "a short label for the screen"
                  ]
                },
                "It does not include your cards, contacts or credentials."
              ]
            }
          ]
        },
        {
          "title": "Across the service",
          "sections": [
            {
              "id": "hosting",
              "title": "10. Hosting and request information",
              "blocks": [
                "The website and online services use cloud hosting, including Cloudflare. creds.id also relays a few public resources for the website, such as YouTube channel feeds and thumbnails and Google’s attestation revocation list, so your browser does not contact those hosts for them.",
                "Serving requests and protecting these services can involve:",
                {
                  "list": [
                    "IP addresses",
                    "requested URLs and request times",
                    "browser or device information",
                    "operational or security logs"
                  ]
                },
                "This information supports delivery, troubleshooting, rate limiting and abuse prevention. Local-first does not remove this network processing."
              ]
            },
            {
              "id": "tracking",
              "title": "11. Cookies, advertising and analytics",
              "blocks": [
                "The current website does not set application cookies or include advertising, visitor analytics or tracking scripts. It uses the browser storage described in section 5, and serves its fonts with the site. The app has no advertising or analytics either.",
                "A YouTube or Spotify item on a page loads only after you tap it; the player then comes from youtube-nocookie.com or open.spotify.com under their own policies. Hosting and security request processing still occurs. Third-party sites, relays, passkey providers and optional cloud services apply their own policies and may use their own storage or cookies."
              ]
            },
            {
              "id": "third-parties",
              "title": "12. Third parties and international processing",
              "blocks": [
                {
                  "heading": "Services your device contacts"
                },
                "Depending on the page or feature, your device may contact:",
                {
                  "list": [
                    "public relays and name directories",
                    "DNS resolvers and Ethereum name-resolution services",
                    "Bluesky servers",
                    "the websites and profiles you check",
                    "Apple and Google, for device attestation and store purchases",
                    "peers in a private exchange",
                    "other linked services"
                  ]
                },
                "They receive the requests needed for that function, including your IP address. Following an external link connects you to that site. These operators control their own processing.",
                {
                  "heading": "International processing and disclosure"
                },
                "Hosting, email, public relays, app stores and optional backup or passkey services may process information in other countries, whose protections can differ from those where you live. Public content may be distributed worldwide. We may disclose information under our control when required by applicable law or as necessary to address abuse or protect legal rights."
              ]
            }
          ]
        },
        {
          "title": "Your choices and rights",
          "sections": [
            {
              "id": "rights-retention",
              "title": "13. Your choices, rights and deletion limits",
              "blocks": [
                {
                  "heading": "Choices and retention"
                },
                "You can choose what to publish, edit information where supported, clear browser storage, and manage device permissions and provider backups. We retain service records as needed to operate and secure the relevant feature or meet applicable legal obligations; the directory-log period is given in section 3. Uninstalling an app or clearing a browser does not erase every copy, and some app resets preserve identity keys.",
                {
                  "heading": "Your rights"
                },
                "Depending on applicable law, you may have rights to:",
                {
                  "list": [
                    "access, correct or delete information, or receive a copy of it",
                    "restrict or object to processing",
                    "withdraw consent where processing relies on it",
                    "complain to the relevant data-protection authority"
                  ]
                },
                "Contact gm@solidarity.gg with your request. We may need proportionate verification of your authority. We handle requests in accordance with applicable legal requirements.",
                {
                  "heading": "What deletion can and cannot reach"
                },
                "You can remove a passkey and its encrypted vault record in passkey management on the website or in the app, and delete your whole account as described in section 14. Contact us about other records under our control; this contact route does not itself delete them.",
                "Published checks, witnesses and passport statements are public relay copies. We cannot guarantee removal from independent relays, recipients, caches or other copies outside our control. Cloud backups and passkey-provider copies must also be managed with those providers."
              ]
            },
            {
              "id": "account-deletion",
              "title": "14. Deleting your account",
              "blocks": [
                {
                  "heading": "In the app"
                },
                "In the creds app (version 2.0 and later), go to Settings, then Delete account. After you confirm with Face ID or your device passcode, the app uses keys that exist only on your phone to:",
                {
                  "list": [
                    "publish empty replacements and Nostr deletion requests for the page, checks and witness statements the app published under your key, and remove the creds.id name and identity binding the app added to your Nostr profile (other fields you set elsewhere are left as they are);",
                    "unlink every creds.id name your key held and delete its directory operation logs;",
                    "delete every encrypted root-vault record in your owner index, including passkeys added on the website;",
                    "delete the link between your creds Pro purchase and your identity;",
                    "delete any messages still held for you by the retired Shoutouts inbox;",
                    "finally, erase identity keys, cards, contacts, credentials and settings on the phone."
                  ]
                },
                "If any online step fails, the app says which one, keeps your keys on the phone and lets you retry; it never reports the account as deleted until every step has succeeded.",
                {
                  "heading": "Without the app"
                },
                "Go to creds.id/delete-account and sign in with a passkey of the account: the website runs the same online steps with your own keys and then clears its copies in that browser.",
                "Every deletion request, from the app or the website, is signed by the account’s own keys and is accepted only once and only for a few minutes; we never delete an account because of an email alone. If you have lost both the app and your passkeys, email gm@solidarity.gg and we will explain how to sign a request with your recovery phrase. Without the keys nobody, including us, can show the account is yours, so nothing is deleted.",
                {
                  "heading": "What stays, and why"
                },
                {
                  "list": [
                    "A deleted name remains reserved permanently as a record linked to no key, so nobody else can register it and impersonate your old page. It cannot be reclaimed afterwards, not even with your old key.",
                    "Public relays are operated by others; most honour deletion requests, but we cannot guarantee it, and copies already fetched by visitors, apps, caches or the people you shared cards or statements with cannot be recalled.",
                    "Hosting and security logs follow their own short retention.",
                    "Backups in your iCloud Drive, Google Drive or iCloud Keychain, a recovery phrase you exported, and passkeys held by your passkey provider are under your control; remove them there."
                  ]
                },
                {
                  "heading": "Subscriptions"
                },
                "Deleting your account does not cancel a creds Pro subscription. Cancel it in the App Store or Google Play subscription settings; otherwise the store keeps billing you. Apple and Google keep their own purchase records under their policies."
              ]
            },
            {
              "id": "minors",
              "title": "15. Minors",
              "blocks": [
                "creds is not directed at children. If you are below the age at which you can independently agree to use the service where you live, involve a parent or guardian as required by law. Avoid publishing a minor’s personal information. Contact us if you believe information about a child has been shared improperly so we can assess steps within our control."
              ]
            },
            {
              "id": "changes-contact",
              "title": "16. Changes and contact",
              "blocks": [
                "We may update this policy as the service changes. The effective date identifies this version. We will publish updates here and provide additional notice or obtain consent when applicable law requires it. Questions and privacy requests can be sent to gm@solidarity.gg."
              ]
            }
          ]
        }
      ]
    },
    "terms": {
      "intro": "These terms apply to your use of creds (creds.id), provided by the Solid(ar)ity project (“we”). By using the service, you agree to these terms. If you do not agree, stop using it. The Privacy Policy explains how information is handled. The key points below are a summary; the numbered sections are the full terms.",
      "highlights": [
        "You keep ownership of what you publish. Publishing makes it public, and copies others already hold cannot be recalled.",
        "You hold your keys. If you lose them and your recovery material, we cannot restore access.",
        "A check confirms a specific technical claim; it does not prove who someone is or that they can be trusted.",
        "creds Pro is billed by the App Store or Google Play under their terms.",
        "Nothing here takes away rights you have by law or under an open-source license."
      ],
      "parts": [
        {
          "title": "Using creds",
          "sections": [
            {
              "id": "scope",
              "title": "1. Scope and eligibility",
              "blocks": [
                "creds provides tools for publishing and viewing public pages, linking identifiers, checking links and cryptographic claims, and exchanging cards, through the website and the creds app (version 2.0 and later), with an optional paid plan. Features and recovery options vary by platform, device and third-party support. Earlier app versions, published under the Solid(ar)ity name, worked differently.",
                "You must have the legal capacity or required parent or guardian permission to use the service."
              ]
            },
            {
              "id": "acceptable-use",
              "title": "2. Acceptable use",
              "blocks": [
                "Use the service lawfully and respect others’ privacy and intellectual property. Do not:",
                {
                  "list": [
                    "impersonate others, or publish unlawful or infringing content;",
                    "harass people, send spam or distribute malware;",
                    "harvest personal information without authority, or interfere with the service or its security;",
                    "misrepresent what a name, signature or check proves, or publish a witness for a page you did not check;",
                    "tamper with the app or its device attestation;",
                    "scan a passport that is not yours without the holder’s permission."
                  ]
                },
                "Names are subject to availability, reservations and anti-abuse rules. A directory entry is a service identifier and does not establish ownership of another person’s name or trademark. These terms do not prohibit legitimate commercial use or activities allowed by applicable law or an applicable software license (see section 9)."
              ]
            },
            {
              "id": "your-content",
              "title": "3. Your content",
              "blocks": [
                {
                  "heading": "Ownership and the license you give us"
                },
                "You retain ownership of content you provide. You must have authority to publish it. You grant us a non-exclusive, worldwide, royalty-free license to host, reproduce, transmit and display it only as needed to provide, secure and maintain the service and carry out your sharing choices. This does not transfer ownership or authorize unrelated advertising uses.",
                {
                  "heading": "Public copies"
                },
                "Publishing sends content to public networks where others can access, copy and retain it. You can stop future sharing or request removal of copies under our control, subject to necessary retention, but cannot revoke copies already held by others through these terms. Other people’s content remains subject to their rights; public availability alone does not grant unrestricted reuse rights.",
                {
                  "heading": "Content others send you"
                },
                "Content other people send you is handled on your device. Blocking a pending card stops future cards from that sender’s ID on this device. A card received offline, for example in a direct exchange, cannot be filtered in advance; you can delete it from Contacts."
              ]
            },
            {
              "id": "keys-recovery",
              "title": "4. Keys, passkeys and recovery",
              "blocks": [
                "Protect your devices, recovery material and passkeys, review what you sign, and use available backup and recovery options with care. Anyone who obtains usable signing material may act as your identity. Loss of the required keys or recovery material may prevent access, and support cannot promise to restore it. Encrypted identity copies and data backups have different contents and recovery requirements.",
                "Your security responsibilities do not remove our responsibilities for the service or excuse defects, misconduct or duties that applicable law places on us. No cryptographic system or backup method guarantees protection against every failure."
              ]
            }
          ]
        },
        {
          "title": "What the service is, and is not",
          "sections": [
            {
              "id": "checks",
              "title": "5. What checks mean",
              "blocks": [
                "A signature or identifier check addresses the specific technical claim shown, using the information available at that time. It does not by itself establish a person’s real-world identity, honesty, qualifications, safety or endorsement by us or another person. Checks can be incomplete, outdated or wrong, and cannot prevent every error or abuse. Use your own judgment for consequential decisions.",
                {
                  "list": [
                    "A witness says that a genuine creds app on a real phone, used by the person named, found the marker at that time; it does not mean that person knows the page owner. One phone can create many attested keys, so a number of witnesses is not a number of people.",
                    "A passport statement says a chip passing passive authentication was read on such a phone; it is not identity verification by a government or by us."
                  ]
                }
              ]
            },
            {
              "id": "paid-plan",
              "title": "6. creds Pro",
              "blocks": [
                "creds Pro is sold as a subscription through the App Store or Google Play. The store’s terms govern billing, renewal, cancellation and refunds; manage them in your store account. Pro is tied to the identity that redeemed it, and its features may change over time. Mandatory consumer rights are not affected."
              ]
            },
            {
              "id": "third-parties",
              "title": "7. Third-party services",
              "blocks": [
                "Public relays, hosting providers, name-resolution services, linked sites, passkey providers, app stores, Apple and Google attestation services and optional cloud backups have their own availability, terms and privacy practices. They may change, restrict access or retain copies independently. We do not control those operators, and linking to them does not endorse them. Our own legal responsibilities remain unaffected."
              ]
            },
            {
              "id": "non-financial",
              "title": "8. No financial service",
              "blocks": [
                "creds is not a bank, custodian, payment service or investment adviser; a Pro subscription is paid to the app store. Identity keys, public identifiers and name-resolution checks do not provide financial advice, hold funds for you or guarantee a transaction or counterparty. Do not treat a check as a reason to send money or disclose secrets."
              ]
            },
            {
              "id": "intellectual-property",
              "title": "9. Software, open-source components and trademarks",
              "blocks": [
                {
                  "heading": "Our software"
                },
                "The service’s software, design and other materials remain subject to their respective intellectual-property rights. Where code is released under an open-source license, the LICENSE file in that specific repository governs the rights it grants. These terms do not restrict those rights or imply that all website code is open source.",
                {
                  "heading": "Third-party open-source components"
                },
                "The creds app includes open-source components made by others. Their names, licenses and notices are listed in the app under Settings, Open-source licenses, and those licenses continue to apply to the components they cover. Nothing in these terms limits the rights those licenses give you, including any right a license grants to modify, relink or reverse-engineer the component it covers.",
                {
                  "heading": "Trademarks"
                },
                "The creds and Solid(ar)ity names, logos and other brand assets are separate from any code license. A code license does not grant trademark rights. Descriptive use and other rights permitted by applicable law remain available."
              ]
            }
          ]
        },
        {
          "title": "Legal terms",
          "sections": [
            {
              "id": "availability-termination",
              "title": "10. Availability, restrictions and stopping use",
              "blocks": [
                "We may update, restrict or discontinue features to maintain the service, address abuse or meet legal obligations. Where reasonably practicable and legally required, we will provide notice and an opportunity to preserve data. We may restrict access or content under our control for a material breach, security needs or a legal requirement.",
                "You may stop using the service at any time. Stopping use, a suspension, uninstalling the app or removing a page does not automatically erase local storage, directory records, encrypted vaults, cloud backups or public copies. The Privacy Policy describes the relevant limits and contact route. Open-source rights and provisions that by their nature continue, including content-copy limits and applicable liability rules, survive stopping use."
              ]
            },
            {
              "id": "liability-rights",
              "title": "11. Service limitations and your legal rights",
              "blocks": [
                "To the extent permitted by applicable law, the service is provided “as is” and “as available”, without additional warranties of uninterrupted availability, compatibility, fitness for a particular purpose or error-free operation. To that same extent, we exclude liability for indirect or consequential loss arising from use of the service.",
                "These limits do not exclude or restrict liability for fraud, intentional misconduct, gross negligence, or any other responsibility that cannot lawfully be excluded or restricted. They do not remove mandatory consumer guarantees, remedies, data-protection rights or other non-waivable rights. Any limitation applies only to the extent it is lawful in your circumstances."
              ]
            },
            {
              "id": "changes",
              "title": "12. Changes to these terms",
              "blocks": [
                "We may update these terms as the service changes. We will publish the revised terms and their effective date here, and provide additional notice or seek agreement where applicable law requires it. Changes do not remove rights already accrued. If a provision is unenforceable, the remaining provisions apply to the extent permitted by law."
              ]
            },
            {
              "id": "contact-disputes",
              "title": "13. Contact and disputes",
              "blocks": [
                "For questions, reports of misuse or disputes, contact gm@solidarity.gg. Applicable law determines the rights and forums available to you, including mandatory consumer protections."
              ]
            }
          ]
        }
      ]
    }
  },
  "zh-Hant": {
    "privacy": {
      "intro": "本政策說明由 Solid(ar)ity project（以下稱「我們」）提供的 creds（creds.id），如何在你瀏覽、發布頁面、使用 creds App 或聯絡我們時處理資訊。App 內顯示的也是這份政策。Local-first 表示部分運算與儲存在你的裝置上進行；線上功能仍會使用伺服器。以下重點僅為摘要，完整內容以編號條文為準。",
      "highlights": [
        "身分金鑰保存在你的手機上。creds.id 為 passkey 登入保存的副本經過加密，設計上只在你的裝置上解密。",
        "你發布的內容（頁面、查驗、見證與護照聲明）會公開在 Nostr relays 上，他人已持有的副本無法收回。",
        "護照上的姓名、號碼、照片及其他晶片資料在你的手機上讀取與查驗，不會傳給我們，也不會公開。",
        "網站與 App 都沒有廣告、訪客分析或追蹤腳本。",
        "雲端備份預設關閉；開啟後，加密副本存入你自己的 iCloud Drive 或 Google Drive。",
        "你可以在 App 的「設定」中刪除帳號，或前往 creds.id/delete-account。"
      ],
      "parts": [
        {
          "title": "關於本政策",
          "sections": [
            {
              "id": "scope",
              "title": "1. 功能與版本",
              "blocks": [
                "處理哪些資訊取決於你使用的功能。單純瀏覽頁面不會自動建立名稱目錄紀錄、連接 passkey、發布查驗或啟用手機備份。",
                "功能依平台而異。網站支援公開頁面、以 passkey 建立身分及 passkey 登入。creds App 2.0 以上版本（iPhone 與 Android）另提供第 4 節及第 6 至 8 節所述的功能。較早以 Solid(ar)ity 名稱發布的 App 版本運作方式不同；本政策描述的是 2.0 以上版本。"
              ]
            }
          ]
        },
        {
          "title": "各功能如何處理你的資訊",
          "sections": [
            {
              "id": "public-content",
              "title": "2. 公開頁面與 Nostr relays",
              "blocks": [
                {
                  "heading": "哪些內容會公開"
                },
                "發布時，你加入的個人資料欄位，例如顯示名稱、簡介、連結與列出的身分，會與公開識別碼、簽章及簽署時間一併公開。連接的 Nostr 個人資料也可能公布你的 creds.id 名稱與身分綁定。你選擇發布的查驗與聲明同樣公開，詳見第 4 節。請勿發布你想保密的資訊，或未經授權發布他人的資訊。",
                {
                  "heading": "頁面如何傳遞"
                },
                "公開頁面透過 Nostr 公共 relays 傳遞。訪客與 App 會查詢公開金鑰和事件，以取得及查驗頁面；relay 營運者可看到這些查詢與連線 IP 位址。",
                "他人可能複製、建立索引或保留公開內容。更新頁面、關閉 QR 畫面、登出或提出刪除請求，都不會收回已分享的副本。"
              ]
            },
            {
              "id": "directory",
              "title": "3. 名稱目錄",
              "blocks": [
                "如果你申請或管理 creds.id 名稱，目錄會處理：",
                {
                  "list": [
                    "名稱與其公開金鑰",
                    "relay 清單",
                    "狀態與時間戳記",
                    "改名或重新導向資訊"
                  ]
                },
                "公開名稱查詢會提供名稱與金鑰的綁定及 relay 資訊。為防止濫用或重新分配，保留名稱與已釋放名稱的紀錄可能持續保留。",
                "目錄操作記錄包含註冊、釋放及恢復操作與簽署請求，保存期間為 90 天。這個期間適用於操作記錄，不適用於有效或保留的名稱紀錄、公共 relay 副本或主機服務記錄。"
              ]
            },
            {
              "id": "checks-witnesses",
              "title": "4. 連結查驗、見證與護照聲明",
              "blocks": [
                {
                  "heading": "查驗連結"
                },
                "App 查驗頁面上的連結時，由你的手機自己抓取該公開個人資料或網站，尋找頁面擁有者的 creds.id 標記。被查驗的網站會看到來自你手機的請求，包括你的 IP 位址。除非你選擇發布，不會公開任何內容。",
                {
                  "heading": "綠勾與見證"
                },
                "當你替自己的連結加上綠勾，或在別人的頁面按「見證」，App 會將一則簽署聲明發布到 Nostr 公共 relays；任何人都能看到你查驗過那個頁面。聲明包含：",
                {
                  "list": [
                    "被查驗的連結與 creds.id 名稱",
                    "頁面擁有者的公開金鑰與你自己的公開金鑰",
                    "你的手機查看的時間",
                    "裝置證明：Apple（App Attest）或 Google（Android Key Attestation）出具的、證明它由真機上未經修改的 creds App 產生的 attestation"
                  ]
                },
                "取得 attestation 時會連線 Apple 或 Google。它證明的是正版 App 與真實裝置，不是你是誰，也不能用來計算不同的人數。",
                {
                  "heading": "護照聲明"
                },
                "用 App 在有 NFC 的手機上掃描護照時，晶片透過 NFC 讀取並在你的手機上查驗；護照上的姓名、號碼、照片及其他晶片資料不會傳給我們，也不會公開。",
                "之後你可以發布一則由裝置金鑰簽署的護照聲明，內容是：一個通過 passive authentication 的晶片已針對你的公開金鑰讀取、持有人是否年滿 18 歲，以及讀取與簽署時間。App 約每 30 天重新簽署一次。只有在你選擇被計入時，聲明才會包含護照 nullifier；這是由晶片資料衍生的值，發照國或任何持有晶片資料的人都能算出並連結到你的公開金鑰。",
                {
                  "heading": "副本與網站上的查驗"
                },
                "已發布的查驗與聲明，和你頁面的其他內容一樣是公開副本；替換或撤回不會收回他人已持有的副本。在網站上瀏覽頁面時，這些聲明由你的瀏覽器查驗；為了檢查 Android 金鑰是否被撤銷，網站會透過 creds.id 取得 Google 的公開撤銷清單。"
              ]
            },
            {
              "id": "browser-storage",
              "title": "5. 瀏覽器儲存與 passkey",
              "blocks": [
                {
                  "heading": "網站在瀏覽器中保存的資料"
                },
                "目前網站使用 local storage 儲存頁面草稿、草稿擁有者或來源資訊，以及語言與主題偏好。草稿可能在離開頁面後繼續保留，且不是加密備份。",
                "舊版網站也可能在 IndexedDB 留下受 passkey 保護的身分資料；目前登入流程不會建立該本機 vault。如果你在網站上建立身分而上傳尚未完成，一份以 passkey 封存的副本會留在 local storage，直到送出。清除網站資料會移除本機副本，不會刪除遠端紀錄或 passkey 供應商的副本。",
                {
                  "heading": "以 passkey 建立身分與登入"
                },
                "在網站上以相容的 passkey（例如 Apple 或 Google 的 passkey）建立身分時，恢復詞在瀏覽器中產生，以該 passkey 衍生的金鑰資料封存後，作為加密 root vault 紀錄上傳至 creds.id。登入時，瀏覽器依 passkey 憑證衍生的位址請求該紀錄，在本機解密，並在記憶體中使用已解鎖的身分簽署。",
                "同一身分的多把 passkey 以擁有者索引相連，讓你列出、重新命名及移除；creds.id 儲存加密紀錄、由 passkey 衍生的索引金鑰，以及你取的 passkey 名稱。Passkey 供應商可能依其設定與政策同步 passkey。客服無法替換遺失的恢復詞，也不能保證在 passkey 遺失後恢復存取。"
              ]
            },
            {
              "id": "mobile-vault",
              "title": "6. 手機身分與加密 root vault",
              "blocks": [
                "creds App 會將身分金鑰資料保存在裝置的安全儲存空間。連接 passkey 時，會將包含恢復詞，以及適用時在裝置上另外儲存的 Nostr 簽署金鑰的完整加密 vault，上傳至 creds.id。服務儲存密文與依 passkey 衍生的儲存位址；設計上由你的裝置使用 passkey 解密。這份加密身分副本用於第 5 節所述的網站登入，與聯絡人或名片的資料備份不同。",
                "在 iPhone 上，App 也可能在 iCloud Keychain 保留恢復副本。裝置安全儲存空間、iCloud Keychain 與 creds.id root vault 是不同的儲存位置。加密可降低資料暴露的風險，但不保證防止所有入侵或遺失情況。"
              ]
            },
            {
              "id": "mobile-backups",
              "title": "7. 選用的手機備份與其他 App 功能",
              "blocks": [
                {
                  "heading": "雲端備份"
                },
                "App 的雲端備份預設不啟用。啟用後，名片、聯絡人、證明、個人資料及頁面的加密副本，會依平台存入你自己的 iCloud Drive 或 Google Drive，也可能用於裝置間同步。這些資料備份不含身分金鑰，且需要相應的恢復資料。iPhone 無法使用 iCloud Drive 時，備份可能留在 App 儲存空間。請透過相應的供應商管理雲端副本。",
                {
                  "heading": "聯絡人、名片與相機"
                },
                "如果使用聯絡人、名片或證明功能，App 會在本機儲存相關資訊，並在你分享或匯出時處理所選資訊。",
                {
                  "list": [
                    "更新已儲存的公開頁面時，會向 relays 查詢其公開金鑰；「最近更新」清單在你的手機上計算。",
                    "從手機通訊錄匯入時，只有在你授權後才會讀取。",
                    "相機在裝置上讀取 QR code 與護照的機讀區。"
                  ]
                },
                "裝置權限及供應商設定會影響這些選用功能。",
                {
                  "heading": "私密名片交換（Pear）"
                },
                "私密名片交換會在你發起或接受交換時，透過點對點網路讓你的手機直接連到對方手機。對方手機與該網路的節點會看到你的 IP 位址；你核准的名片只傳給那個人。你可以在設定中關閉私密交換。"
              ]
            },
            {
              "id": "purchases",
              "title": "8. App 內購買",
              "blocks": [
                "creds Pro 是 App 的選用付費方案，透過 App Store 或 Google Play 購買。付款由商店處理並保存你的付款資料，我們不會收到。為了開通 Pro，App 會把你身分的公開識別碼（did:key）、平台與商店的購買識別碼，以你的身分簽署後送到 creds.id，換取一張短期授權；creds.id 會向 Apple 或 Google 確認該筆購買。",
                "有 Pro 時，你可以請 creds.id notary 見證你的頁面。App 會送出你已簽署的公開頁面、名稱與授權；notary 自己抓取你連結的公開個人資料，並將它自己的聲明發布到公共 relays，如第 4 節所述。"
              ]
            },
            {
              "id": "support",
              "title": "9. 客服訊息與錯誤回報",
              "blocks": [
                {
                  "heading": "寄信給客服"
                },
                "當你寄信至 gm@solidarity.gg，我們與電子郵件供應商會處理你的電子郵件地址、訊息、附件及相關往來，以回覆及處理請求。請僅提供必要資訊，切勿寄送恢復詞、私鑰或 passkey 機密資料。我們會依客服、安全及適用法律義務所需保留往來紀錄。",
                {
                  "heading": "錯誤回報"
                },
                "發生錯誤時，App 可以草擬一封寄到 err@solidarity.gg 的錯誤回報信。除非你從郵件 App 寄出，否則不會傳送；寄出前你可以閱讀與修改。草稿包含：",
                {
                  "list": [
                    "錯誤訊息、代碼與技術追蹤",
                    "App 版本、你的平台與系統版本",
                    "畫面的簡短標籤"
                  ]
                },
                "草稿不包含你的名片、聯絡人或憑證。"
              ]
            }
          ]
        },
        {
          "title": "整個服務共通",
          "sections": [
            {
              "id": "hosting",
              "title": "10. 主機服務與請求資訊",
              "blocks": [
                "網站與線上服務使用包括 Cloudflare 在內的雲端主機。creds.id 也替網站轉送少數公開資源，例如 YouTube 頻道列表與縮圖，以及 Google 的 attestation 撤銷清單，所以你的瀏覽器不必為此連線這些主機。",
                "傳送請求及保護服務的過程可能涉及：",
                {
                  "list": [
                    "IP 位址",
                    "請求網址與請求時間",
                    "瀏覽器或裝置資訊",
                    "運作或安全記錄"
                  ]
                },
                "這些資訊用於提供服務、排查問題、限制請求頻率及防止濫用。Local-first 不代表沒有這些網路處理。"
              ]
            },
            {
              "id": "tracking",
              "title": "11. Cookies、廣告與分析",
              "blocks": [
                "目前網站不設定應用程式 cookies，也不加入廣告、訪客分析或追蹤腳本。網站使用第 5 節所述的瀏覽器儲存空間，並隨網站提供字型。App 也沒有廣告或分析。",
                "頁面上的 YouTube 或 Spotify 項目在你點按後才載入，播放器之後由 youtube-nocookie.com 或 open.spotify.com 提供，適用其自身政策。主機服務及安全所需的請求處理仍會發生。第三方網站、relays、passkey 供應商及選用雲端服務適用各自的政策，也可能使用自己的儲存空間或 cookies。"
              ]
            },
            {
              "id": "third-parties",
              "title": "12. 第三方與跨境處理",
              "blocks": [
                {
                  "heading": "你的裝置會連接的服務"
                },
                "依頁面或功能不同，你的裝置可能連接：",
                {
                  "list": [
                    "公共 relays 與名稱目錄",
                    "DNS 解析服務與 Ethereum 名稱解析服務",
                    "Bluesky 伺服器",
                    "你查驗的網站與個人資料",
                    "Apple 與 Google（裝置 attestation 與商店購買）",
                    "私密交換中的對方",
                    "其他連結服務"
                  ]
                },
                "這些服務會收到該功能所需的請求，包括你的 IP 位址。開啟外部連結會連接至該網站。這些營運者自行管理其資料處理。",
                {
                  "heading": "跨境處理與揭露"
                },
                "主機服務、電子郵件、公共 relays、App 商店，以及選用的備份或 passkey 服務，可能在其他國家處理資訊，其保護程度可能與你所在地不同。公開內容可能傳送至全球各地。我們可能依適用法律要求，或在處理濫用及保護合法權利所必要的範圍內，揭露我們控制的資訊。"
              ]
            }
          ]
        },
        {
          "title": "你的選擇與權利",
          "sections": [
            {
              "id": "rights-retention",
              "title": "13. 你的選擇、權利與刪除限制",
              "blocks": [
                {
                  "heading": "選擇與保存"
                },
                "你可以選擇發布內容、在支援的功能中修改資訊、清除瀏覽器儲存空間，以及管理裝置權限與供應商備份。我們依營運及保護相關功能或履行適用法律義務所需保留服務紀錄；目錄操作記錄的期間見第 3 節。移除 App 或清除瀏覽器不會刪除所有副本，部分 App 重設操作也會保留身分金鑰。",
                {
                  "heading": "你的權利"
                },
                "依適用法律，你可能享有以下權利：",
                {
                  "list": [
                    "查閱、更正、刪除資訊，或取得資訊副本",
                    "限制或反對處理",
                    "在以同意為依據時撤回同意",
                    "向相關資料保護主管機關申訴"
                  ]
                },
                "請寄信至 gm@solidarity.gg 提出請求。我們可能需要以適當方式核實你的權限，並依適用法律要求處理。",
                {
                  "heading": "刪除能與不能觸及的範圍"
                },
                "你可以在網站或 App 的 passkey 管理中，移除一把 passkey 及其加密 vault 紀錄，也可以依第 14 節刪除整個帳號。關於我們控制的其他紀錄，請聯絡我們；聯絡本身不會直接刪除紀錄。",
                "已發布的查驗、見證與護照聲明屬於公共 relay 副本。我們無法保證從獨立 relays、收件人、快取或其他不受我們控制的副本移除資訊。雲端備份與 passkey 供應商副本，也必須透過該供應商管理。"
              ]
            },
            {
              "id": "account-deletion",
              "title": "14. 刪除你的帳號",
              "blocks": [
                {
                  "heading": "在 App 中刪除"
                },
                "在 creds App（2.0 以上版本）中，前往「設定」→「刪除帳號」。以 Face ID 或裝置密碼確認後，App 會用只存在你手機上的金鑰：",
                {
                  "list": [
                    "為 App 以你的金鑰發布的頁面、查驗與見證聲明發布空白取代版本與 Nostr 刪除請求，並從你的 Nostr 個人檔案移除 App 加入的 creds.id 名稱與身分綁定（你在其他地方設定的欄位不會變動）；",
                    "解除你的金鑰持有過的所有 creds.id 名稱連結，並刪除其目錄操作記錄；",
                    "刪除 owner index 中所有加密 root vault 紀錄，包括在網站上新增的 passkey；",
                    "刪除 creds Pro 購買與你身分之間的連結；",
                    "刪除已停用的 Shoutouts 收件匣中仍為你保留的訊息；",
                    "最後清除手機上的身分金鑰、名片、聯絡人、憑證與設定。"
                  ]
                },
                "任何線上步驟失敗時，App 會指出是哪一步、把金鑰留在手機上並讓你重試；在所有步驟成功之前，絕不會顯示帳號已刪除。",
                {
                  "heading": "沒有 App 時"
                },
                "請到 creds.id/delete-account 用該帳號的 passkey 登入：網站會用你自己的金鑰執行相同的線上步驟，並清除該瀏覽器中的副本。",
                "無論來自 App 或網站，每一個刪除請求都由帳號自己的金鑰簽署，且只在幾分鐘內有效、只能使用一次；我們絕不會只因一封 email 就刪除帳號。如果你同時失去 App 與 passkey，請寄信至 gm@solidarity.gg，我們會說明如何用復原詞簽署請求。沒有金鑰，任何人（包括我們）都無法證明帳號屬於你，因此不會刪除任何東西。",
                {
                  "heading": "會保留的內容與原因"
                },
                {
                  "list": [
                    "已刪除的名稱會以不連結任何金鑰的紀錄永久保留，避免他人註冊後冒充你過去的頁面；之後無法取回，即使使用舊金鑰也不行。",
                    "公共 relays 由他人營運，多數會遵守刪除請求，但我們無法保證；訪客、應用程式、快取，或你分享過名片與聲明的對象已取得的副本無法收回。",
                    "主機與安全記錄依其各自的短期保存期間處理。",
                    "你的 iCloud Drive、Google 雲端硬碟或 iCloud 鑰匙圈備份、你匯出的復原詞，以及 passkey 供應商保存的 passkey 由你控制，請在該處移除。"
                  ]
                },
                {
                  "heading": "訂閱"
                },
                "刪除帳號不會取消 creds Pro 訂閱。請在 App Store 或 Google Play 的訂閱設定中取消，否則商店會繼續收費。Apple 與 Google 會依其政策保留自己的購買紀錄。"
              ]
            },
            {
              "id": "minors",
              "title": "15. 未成年人",
              "blocks": [
                "creds 並非以兒童為服務對象。如果你未達所在地可自行同意使用服務的年齡，請依法律要求由家長或監護人參與。請避免發布未成年人的個人資訊。如果你認為兒童資訊遭到不當分享，請聯絡我們，以便評估我們控制範圍內可採取的措施。"
              ]
            },
            {
              "id": "changes-contact",
              "title": "16. 政策變更與聯絡",
              "blocks": [
                "我們可能隨服務變更更新本政策，生效日用於識別此版本。我們會在此發布更新，並在適用法律要求時另行通知或取得同意。政策問題與隱私請求請寄至 gm@solidarity.gg。"
              ]
            }
          ]
        }
      ]
    },
    "terms": {
      "intro": "本條款適用於你使用由 Solid(ar)ity project（以下稱「我們」）提供的 creds（creds.id）。使用服務即表示你同意本條款；若不同意，請停止使用。隱私政策說明資訊的處理方式。以下重點僅為摘要，完整內容以編號條文為準。",
      "highlights": [
        "你發布的內容仍歸你所有。發布即公開，他人已持有的副本無法收回。",
        "金鑰由你自己保管。金鑰與恢復資料都遺失時，我們無法替你恢復存取。",
        "查驗只確認一項特定的技術聲明，不證明一個人是誰，也不代表對方值得信任。",
        "creds Pro 由 App Store 或 Google Play 依其條款收費。",
        "本條款不會剝奪你依法律或開源授權享有的權利。"
      ],
      "parts": [
        {
          "title": "使用 creds",
          "sections": [
            {
              "id": "scope",
              "title": "1. 範圍與使用資格",
              "blocks": [
                "creds 提供發布及瀏覽公開頁面、連接識別碼、查驗連結與加密聲明及交換名片的工具，透過網站與 creds App（2.0 以上版本）提供，並有選用付費方案。功能及恢復選項依平台、裝置與第三方支援而異。較早以 Solid(ar)ity 名稱發布的 App 版本運作方式不同。",
                "你必須具備使用服務所需的法律行為能力，或取得必要的家長或監護人同意。"
              ]
            },
            {
              "id": "acceptable-use",
              "title": "2. 合理使用",
              "blocks": [
                "請合法使用服務，尊重他人的隱私與智慧財產權。不得：",
                {
                  "list": [
                    "冒名，或發布違法、侵權內容；",
                    "騷擾他人、發送垃圾訊息或散布惡意程式；",
                    "未經授權蒐集個人資訊，或干擾服務與其安全機制；",
                    "誤導他人對名稱、簽章或查驗結果的理解，或替沒有查驗過的頁面發布見證；",
                    "竄改 App 或其裝置 attestation；",
                    "未經持有人同意掃描不屬於你的護照。"
                  ]
                },
                "名稱受可用性、保留名稱及防濫用規則限制。目錄紀錄是服務識別碼，不代表取得他人姓名或商標的所有權。本條款不禁止正當商業使用，或適用法律及軟體授權所允許的行為（見第 9 節）。"
              ]
            },
            {
              "id": "your-content",
              "title": "3. 你的內容",
              "blocks": [
                {
                  "heading": "所有權與你授予我們的授權"
                },
                "你保留所提供內容的所有權，並應具備發布該內容的權限。你授予我們非專屬、全球、免權利金的授權，僅在提供、保護及維護服務與執行你的分享選擇所需範圍內，代管、重製、傳送及展示內容。此授權不轉移所有權，也不授權無關的廣告用途。",
                {
                  "heading": "公開副本"
                },
                "發布會將內容傳送至公共網路，他人可存取、複製與保留。你可以停止後續分享，或要求移除我們控制的副本，但仍受必要保留限制；本條款無法撤銷他人已持有的副本。他人的內容仍受其權利保護，公開可見本身不代表可無限制再利用。",
                {
                  "heading": "他人傳給你的內容"
                },
                "他人傳給你的內容在你的裝置上處理。封鎖一張待處理名片後，這支裝置會擋下同一寄件者 ID 之後傳來的名片。離線收到的名片（例如面對面交換）無法事先過濾，你可以從聯絡人中刪除。"
              ]
            },
            {
              "id": "keys-recovery",
              "title": "4. 金鑰、passkey 與恢復",
              "blocks": [
                "請保護裝置、恢復資料與 passkey，確認所簽署的內容，並謹慎使用可用的備份與恢復選項。取得可用簽署金鑰資料的人可能以你的身分操作。遺失必要金鑰或恢復資料可能導致無法存取，客服無法保證恢復。加密身分副本與資料備份的內容及恢復條件不同。",
                "你的安全責任不會免除我們對服務的責任，也不能免除缺陷、不當行為或適用法律要求我們承擔的義務。任何加密系統或備份方式都不保證防止所有失敗情況。"
              ]
            }
          ]
        },
        {
          "title": "服務是什麼、不是什麼",
          "sections": [
            {
              "id": "checks",
              "title": "5. 查驗結果的意義",
              "blocks": [
                "簽章或識別碼查驗，僅針對畫面所示的特定技術聲明，以當時可用的資訊進行。它本身不證明一個人在現實中的身分、誠信、資格、安全性，也不代表我們或他人為其背書。查驗可能不完整、過期或有誤，無法阻止所有錯誤與濫用。涉及重要決定時，請自行審慎判斷。",
                {
                  "list": [
                    "見證表示：由所列的人使用、在真機上的正版 creds App，當時找到了標記；不代表那個人認識頁面擁有者。一支手機可以產生多把經 attestation 的金鑰，所以見證數不等於人數。",
                    "護照聲明表示：在這樣的手機上讀取了一個通過 passive authentication 的晶片；它不是政府或我們進行的身分核實。"
                  ]
                }
              ]
            },
            {
              "id": "paid-plan",
              "title": "6. creds Pro 付費方案",
              "blocks": [
                "creds Pro 以訂閱方式透過 App Store 或 Google Play 販售。帳單、續訂、取消與退款依商店條款處理，請在你的商店帳號中管理。Pro 綁定兌換它的身分，功能可能隨時間調整。強制性的消費者權利不受影響。"
              ]
            },
            {
              "id": "third-parties",
              "title": "7. 第三方服務",
              "blocks": [
                "公共 relays、主機供應商、名稱解析服務、外部網站、passkey 供應商、App 商店、Apple 與 Google 的 attestation 服務及選用雲端備份，各有其可用性、條款與隱私做法。它們可能自行變更、限制存取或保留副本。我們不控制這些營運者，提供連結也不代表背書。我們自身的法律責任不受影響。"
              ]
            },
            {
              "id": "non-financial",
              "title": "8. 非金融服務",
              "blocks": [
                "creds 不是銀行、資產保管者、支付服務或投資顧問；Pro 訂閱款項付給 App 商店。身分金鑰、公開識別碼與名稱解析查驗，不提供財務建議、不為你保管資金，也不保證交易或交易對象。請勿僅因查驗結果就匯款或揭露機密。"
              ]
            },
            {
              "id": "intellectual-property",
              "title": "9. 軟體、開源元件與商標",
              "blocks": [
                {
                  "heading": "我們的軟體"
                },
                "服務的軟體、設計及其他素材，仍受各自的智慧財產權規範。程式碼若以開源授權發布，其授予的權利以該特定 repository 的 LICENSE 檔案為準。本條款不限制這些權利，也不表示所有網站程式碼都是開源。",
                {
                  "heading": "第三方開源元件"
                },
                "creds App 包含他人開發的開源元件。它們的名稱、授權與聲明列在 App 的「設定」→「開源授權」中，這些授權繼續適用於其涵蓋的元件。本條款不限制這些授權給予你的權利，包括授權允許你對其涵蓋元件進行修改、重新連結或逆向工程的權利。",
                {
                  "heading": "商標"
                },
                "creds、Solid(ar)ity 名稱、標誌與其他品牌素材，與程式碼授權分開。程式碼授權不授予商標權；描述性使用及適用法律允許的其他權利仍予保留。"
              ]
            }
          ]
        },
        {
          "title": "法律條款",
          "sections": [
            {
              "id": "availability-termination",
              "title": "10. 可用性、限制與停止使用",
              "blocks": [
                "我們可能為維護服務、處理濫用或履行法律義務，更新、限制或停止功能。在合理可行且法律要求的情況下，我們會提供通知及保存資料的機會。遇到重大違反條款、安全需求或法律要求時，我們可能限制我們控制的存取或內容。",
                "你可隨時停止使用服務。停止使用、遭停權、移除 App 或移除頁面，不會自動清除本機儲存空間、目錄紀錄、加密 vault、雲端備份或公開副本。隱私政策說明相關限制與聯絡方式。開源權利及依性質應繼續有效的條款，包括內容副本限制與適用責任規則，在停止使用後仍有效。"
              ]
            },
            {
              "id": "liability-rights",
              "title": "11. 服務限制與你的法律權利",
              "blocks": [
                "在適用法律允許的範圍內，服務依「現狀」與「可用狀態」提供，不另保證不中斷、相容性、適合特定目的或完全無誤。在相同法律允許範圍內，我們排除因使用服務所生間接或衍生損失的責任。",
                "這些限制不排除或限制詐欺、故意不當行為、重大過失，或其他依法不得排除或限制的責任，也不剝奪強制性的消費者保障、救濟、資料保護權利或其他不得拋棄的權利。任何限制僅於你的具體情況下合法的範圍內適用。"
              ]
            },
            {
              "id": "changes",
              "title": "12. 條款變更",
              "blocks": [
                "我們可能隨服務變更更新本條款，並在此發布修訂版本及生效日；適用法律要求時，會另行通知或取得同意。變更不剝奪已產生的權利。若某條款無法執行，其餘條款在法律允許範圍內繼續適用。"
              ]
            },
            {
              "id": "contact-disputes",
              "title": "13. 聯絡與爭議",
              "blocks": [
                "問題、濫用檢舉或爭議請寄至 gm@solidarity.gg。你的權利與可使用的爭議處理機構，依適用法律決定，包括強制性的消費者保護。"
              ]
            }
          ]
        }
      ]
    }
  }
};
