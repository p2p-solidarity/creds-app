/**
 * Face ID prompt ledger (2026-10-30) — measurement harness, not a unit test.
 *
 * Drives the REAL gate / signer / store code of the five user stories
 * (docs/ref/10 §1) and counts every OS authentication sheet:
 *   - `expo`   = expo-local-authentication sheets (JS gates),
 *   - `native` = sheets raised by the native sign session (legacy native-ACL
 *                key: keychain prompt inside the sign, or a JS-primed context).
 * Only the network and the native key store are faked. Not part of
 * `bun run test` (which runs __tests__/unit + parity); run it on purpose from
 * apps/expo:
 *   bun test --preload ./test-setup.ts __tests__/ledger          # old native binary
 *   LEDGER_PRIME=1 bun test --preload ./test-setup.ts __tests__/ledger   # binary with primeSignSession
 * Output: one `LEDGER {...}` line per (story, mode, key) — see
 * docs/e2e/2026-10-30-faceid-prompts/result.md.
 */
import { afterAll, describe, expect, it, mock } from 'bun:test';
import { p256 } from '@noble/curves/nist.js';
import {
  base64UrlEncode,
  publicKeyToJwk,
  sha256Bytes,
  signJwtEs256,
  type ProfileRecord,
} from '@solidarity/shared';
import type { SpruceDid } from '@solidarity/nitro-keystone';

// ── OS sheet counters ──────────────────────────────────────────────────────
const sheets = { expo: 0, native: 0 };
const kv = new Map<string, string>();

await mock.module('@/storage/mmkv', () => ({
  getMmkv: () => ({
    getString: (k: string) => kv.get(k),
    getBoolean: () => undefined,
    getNumber: () => undefined,
    set: (k: string, v: string) => void kv.set(k, String(v)),
    remove: (k: string) => kv.delete(k),
    delete: (k: string) => kv.delete(k),
    getAllKeys: () => [...kv.keys()],
    contains: (k: string) => kv.has(k),
  }),
  initMmkv: () => Promise.resolve(undefined),
}));
await mock.module('expo-local-authentication', () => ({
  hasHardwareAsync: () => Promise.resolve(true),
  isEnrolledAsync: () => Promise.resolve(true),
  authenticateAsync: () => {
    sheets.expo += 1;
    return Promise.resolve({ success: true });
  },
}));

const secureItems = new Map<string, string>();
await mock.module('expo-secure-store', () => ({
  WHEN_UNLOCKED: 'WHEN_UNLOCKED',
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
  getItemAsync: (k: string) => Promise.resolve(secureItems.get(k) ?? null),
  setItemAsync: (k: string, v: string) => {
    secureItems.set(k, v);
    return Promise.resolve();
  },
  deleteItemAsync: (k: string) => {
    secureItems.delete(k);
    return Promise.resolve();
  },
  isAvailableAsync: () => Promise.resolve(true),
}));

// ── Fake native key store with a Swift-faithful native sign session ───────
const REUSE_MS = 300_000;
class LedgerDriver {
  keyMode: 'native-acl' | 'js-gated' = 'js-gated';
  /** false = native binary before `primeSignSession` existed. */
  hasPrime = false;
  private readonly keys = new Map<string, Uint8Array>();
  private armedAt: number | null = null;
  private context = 0;

  hasKey(alias: string): boolean {
    return this.keys.has(alias);
  }
  generateKey(alias: string): Promise<string> {
    this.keys.set(alias, p256.utils.randomSecretKey());
    return Promise.resolve(alias);
  }
  deleteKey(alias: string): Promise<boolean> {
    this.keys.delete(alias);
    return Promise.resolve(true);
  }
  getPublicKeyJwk(alias: string): Promise<string> {
    const priv = this.keys.get(alias);
    if (!priv) throw new Error('no key');
    return Promise.resolve(JSON.stringify(publicKeyToJwk(p256.getPublicKey(priv, false))));
  }
  keyAuthMode(): Promise<string> {
    return Promise.resolve(this.keyMode);
  }
  /** Swift `signSerially` for a native-ACL key: reuse inside the window, else prompt. */
  private nativeGate(): void {
    if (this.keyMode !== 'native-acl') return;
    const armed = this.armedAt !== null && Date.now() - this.armedAt < REUSE_MS;
    if (armed) return;
    sheets.native += 1;
    this.context += 1;
    this.armedAt = Date.now();
  }
  async signJws(alias: string, payload: ArrayBuffer): Promise<string> {
    this.nativeGate();
    const priv = this.keys.get(alias);
    if (!priv) throw new Error('no key');
    const claims = JSON.parse(new TextDecoder().decode(new Uint8Array(payload))) as Record<string, unknown>;
    return signJwtEs256({ alg: 'ES256', typ: 'JWT' }, claims, priv);
  }
  async signRawP256(alias: string, digest: ArrayBuffer): Promise<ArrayBuffer> {
    this.nativeGate();
    const priv = this.keys.get(alias);
    if (!priv) throw new Error('no key');
    const sig = p256.sign(new Uint8Array(digest), priv, { prehash: false, format: 'compact' } as never);
    const raw = sig instanceof Uint8Array ? sig : (sig as { toCompactRawBytes: () => Uint8Array }).toCompactRawBytes();
    const out = new ArrayBuffer(64);
    new Uint8Array(out).set(raw);
    return out;
  }
  listSyncableP256Keys(): Promise<string> {
    return Promise.resolve('[]');
  }
  // Present only when `hasPrime` (see getter trick below).
  primeImpl(): Promise<string> {
    sheets.native += 1;
    this.context += 1;
    this.armedAt = Date.now();
    return Promise.resolve('');
  }
  resetImpl(): void {
    this.armedAt = null;
  }
  coldStart(): void {
    this.armedAt = null;
  }
}
const driver = new LedgerDriver();
Object.defineProperty(driver, 'primeSignSession', {
  get: () => (driver.hasPrime ? (_reason: string) => driver.primeImpl() : undefined),
});
Object.defineProperty(driver, 'resetSignSession', {
  get: () => (driver.hasPrime ? () => driver.resetImpl() : undefined),
});
(globalThis as { __SPRUCE_DID_TEST_DRIVER__?: unknown }).__SPRUCE_DID_TEST_DRIVER__ = driver;
(globalThis as { __SPRUCE_DID_TEST_PLATFORM__?: string }).__SPRUCE_DID_TEST_PLATFORM__ = 'ios';
await mock.module('@solidarity/nitro-keystone', () => ({
  getSpruceDid: () => driver as unknown as SpruceDid,
}));

// ── Real modules under measurement ─────────────────────────────────────────
const bio = await import('@/keychain/biometric');
const policy = await import('@/keychain/sensitiveActionPolicy');
const { requireSensitiveAction } = await import('@/keychain/biometricGatekeeper');
const signingKey = await import('@/keychain/signingKey');
const rootKey = await import('@/identity/rootKey');
const nostrKey = await import('@/nostr/userKey');
const profileStore = await import('@/profile/store');
const { publishPassportClaimPublicly } = await import('@/disclosure/publicDisclosure');

const secure = new Map<string, string>();
rootKey.__setRootKeyStorageForTesting({
  getMnemonic: () => Promise.resolve(secure.get('m') ?? null),
  setMnemonic: (m: string) => {
    secure.set('m', m);
    return Promise.resolve();
  },
  deleteMnemonic: () => {
    secure.delete('m');
    return Promise.resolve();
  },
});
nostrKey.__setNostrKeyStorageForTesting({
  getScalarHex: () => Promise.resolve(secure.get('n') ?? null),
  setScalarHex: (hex: string) => {
    secure.set('n', hex);
    return Promise.resolve();
  },
  deleteScalarHex: () => {
    secure.delete('n');
    return Promise.resolve();
  },
});
const okReport = {
  ok: true as const,
  value: {
    event: { id: 'a'.repeat(64), pubkey: 'ab'.repeat(32), created_at: 0, kind: 0, tags: [], content: '', sig: 'b'.repeat(128) },
    results: [],
    acceptedCount: 3,
    requiredCount: 2,
    success: true,
  },
};
profileStore.__setNostrPublishForTesting({
  publishProfile: () => Promise.resolve(okReport),
  updateKind0AlsoKnownAs: () => Promise.resolve(okReport),
});

const RELAYS = ['wss://a', 'wss://b', 'wss://c'];

// ── Story building blocks (each mirrors the call order of the real screen) ─

async function npubAka(): Promise<string[]> {
  const pub = await nostrKey.getNostrPubkey();
  if (!pub.ok) return [];
  const npub = nostrKey.npubEncode(pub.value);
  return npub.ok ? [`nostr:${npub.value}`] : [];
}

async function save(links: number, badges: ProfileRecord['badges'] = []): Promise<void> {
  const store = profileStore.useProfileStore.getState();
  const r = await store.saveProfile(
    {
      displayName: 'Ledger',
      bio: '',
      links: Array.from({ length: links }, (_, i) => ({
        label: `L${String(i)}`,
        url: `https://example.com/${String(i)}`,
      })),
    },
    { alsoKnownAs: await npubAka(), badges }
  );
  if (!r.ok) throw new Error(r.error);
}

// The one card (10 §4, P4) shows the Page URL or its already-signed fragment;
// nothing is signed when the QR opens or a field toggles.
async function presentQr(): Promise<void> {}

async function passportPublicDisclosure(): Promise<void> {
  const rootDid = await rootKey.getRootDid();
  const cardDid = await signingKey.didKeyForCurrentIdentity();
  const created = new Date(Date.now() - 86_400_000);
  const passport = {
    id: 'pp',
    type: 'passport',
    issuerType: 'government',
    trustLevel: 'L1',
    title: 'Passport',
    issuerDid: 'did:gov:passport:example',
    holderDid: cardDid,
    issuedAt: created,
    status: 'fallback',
    sourceReference: 'MRZ+NFC',
    rawCredentialJWT: '',
    metadataTags: [],
    createdAt: created,
    updatedAt: created,
  };
  const claim = {
    id: 'age',
    identityCardId: 'pp',
    claimType: 'age_over_18',
    title: 'age_over_18',
    issuerType: 'government',
    trustLevel: 'L1',
    source: 'Passport',
    payload: '',
    isPresentable: true,
    createdAt: created,
    updatedAt: created,
  };
  const result = await publishPassportClaimPublicly(
    { claimId: 'age', relays: RELAYS },
    {
      nowMs: () => Date.now(),
      createSlot: () => '0198a6e4-0c3d-7a21-9657-54a6b6b20275',
      getRootDid: () => Promise.resolve(rootDid),
      getRootSigner: () => rootKey.getRootSigner(),
      getCurrentCardDid: () => Promise.resolve(cardDid),
      getIdentitySnapshot: () => ({ identityCards: [passport], provableClaims: [claim] }) as never,
      getProfileSnapshot: () => ({ record: profileStore.useProfileStore.getState().record }),
      publishDisclosure: () => Promise.resolve(okReport) as never,
      saveProfileBadges: async (badges) => {
        const store = profileStore.useProfileStore.getState();
        const rec = store.record;
        if (!rec) throw new Error('no profile');
        return store.saveProfile(
          { displayName: rec.displayName, bio: rec.bio, links: rec.links, linkVisibility: store.linkVisibility },
          { badges, alsoKnownAs: rec.alsoKnownAs }
        );
      },
      publishProfileProjection: (relays) => profileStore.useProfileStore.getState().publishToNostr(relays),
    }
  );
  if (!result.ok) throw new Error(`public disclosure: ${result.error.kind}`);
}

interface Story {
  readonly id: string;
  readonly label: string;
  /** Precondition (not counted). */
  readonly setup: () => Promise<void>;
  /** The user's taps, in order — each element is one user intent. */
  readonly intents: readonly { readonly name: string; readonly run: () => Promise<void> }[];
}

async function freshIdentity(): Promise<void> {
  profileStore.useProfileStore.getState().resetForLocalWipe();
  await rootKey.deleteRootKey();
  await nostrKey.deleteNostrKey();
  await signingKey.deleteSigningKey();
  const created = await rootKey.createFromFreshMnemonic();
  if (!created.ok) throw new Error('root');
  await nostrKey.provisionFromFreshRootMnemonic(created.value.mnemonic);
  await signingKey.ensureSigningKey();
}

const STORIES: readonly Story[] = [
  {
    id: '1a',
    label: '建立（新身分）→ 連結頁簽 Page → 背景發佈',
    setup: async () => {
      profileStore.useProfileStore.getState().resetForLocalWipe();
      await rootKey.deleteRootKey();
      await nostrKey.deleteNostrKey();
      await signingKey.deleteSigningKey();
    },
    intents: [
      {
        name: 'create identity (PasskeyStep "Not now")',
        run: async () => {
          const created = await rootKey.createFromFreshMnemonic();
          if (!created.ok) throw new Error('root');
          await nostrKey.provisionFromFreshRootMnemonic(created.value.mnemonic);
          await signingKey.ensureSigningKey();
        },
      },
      {
        name: 'LinksStep save + background publish',
        run: async () => {
          await save(1);
          const r = await profileStore.useProfileStore.getState().publishToNostr(RELAYS);
          if (!r.ok) throw new Error(r.error);
        },
      },
    ],
  },
  {
    id: '1b',
    label: '建立（從 iCloud 還原的身分，沒有 Nostr 金鑰）→ 連結頁',
    setup: async () => {
      await freshIdentity();
      await nostrKey.deleteNostrKey();
      profileStore.useProfileStore.getState().resetForLocalWipe();
    },
    intents: [
      {
        name: 'LinksStep: provision Nostr key + save + publish',
        run: async () => {
          if (!(await nostrKey.hasNostrKey())) await nostrKey.provisionFromRootMnemonic();
          await save(1);
          const r = await profileStore.useProfileStore.getState().publishToNostr(RELAYS);
          if (!r.ok) throw new Error(r.error);
        },
      },
    ],
  },
  {
    id: '2',
    label: '我的頁：加 2 個連結、各自確認加綠勾',
    setup: freshIdentity,
    intents: [
      { name: 'add link 1', run: () => save(1) },
      { name: 'add link 2', run: () => save(2) },
      {
        name: 'confirm link 1 → green check (re-sign)',
        run: () => save(2, [{ type: 'solidarity.link.v1', subject: 'L0', attestation: 'a' }]),
      },
      {
        name: 'confirm link 2 → green check (re-sign)',
        run: () =>
          save(2, [
            { type: 'solidarity.link.v1', subject: 'L0', attestation: 'a' },
            { type: 'solidarity.link.v1', subject: 'L1', attestation: 'b' },
          ]),
      },
    ],
  },
  {
    id: '3',
    label: '出示：打開 QR 卡、切換一次欄位',
    setup: async () => {
      await freshIdentity();
      await save(1);
    },
    intents: [
      { name: 'open Present QR', run: presentQr },
      { name: 'toggle a field (QR rebuilt)', run: presentQr },
    ],
  },
  {
    id: '4',
    label: '收人：Pear 交換（握手 root 簽章 + 放卡）',
    setup: freshIdentity,
    intents: [
      {
        name: 'Pear exchange: handshake sign + card release',
        run: async () => {
          const signer = await rootKey.getRootSigner();
          if (!signer.ok) throw new Error('signer');
          await signer.value(sha256Bytes(new TextEncoder().encode('hello')));
          await bio.requireBiometric('cardRelease');
        },
      },
    ],
  },
  {
    id: '5',
    label: '護照（存→公開揭露）→ 下一個動作；P2 後裝置聲明用裝置金鑰，不問 Face ID',
    setup: async () => {
      await freshIdentity();
      await save(1);
    },
    intents: [
      {
        name: 'save passport (issueCredential gate)',
        run: async () => {
          const g = await requireSensitiveAction('issueCredential', 'save passport');
          if (!g.success) throw new Error('denied');
        },
      },
      { name: 'publish public disclosure', run: passportPublicDisclosure },
      { name: 'next action: open Present QR', run: presentQr },
    ],
  },
  {
    id: '6',
    label: '同一次使用：加連結 → 出示 QR → 再加連結（JS 與原生寬限互通）',
    setup: freshIdentity,
    intents: [
      { name: 'add link', run: () => save(1) },
      { name: 'open Present QR', run: presentQr },
      { name: 'add another link', run: () => save(2) },
    ],
  },
];

type Mode = 'balanced' | 'everyTime' | 'redLineOnly';
type KeyKind = 'js-gated' | 'native-acl (legacy SE)';

const rows: string[] = [];

async function runStory(story: Story, mode: Mode, key: KeyKind, prime: boolean): Promise<void> {
  driver.keyMode = key === 'js-gated' ? 'js-gated' : 'native-acl';
  driver.hasPrime = prime;
  policy.useSensitiveActionPolicy.getState().setMode(mode);
  await story.setup();
  // Cold start: no JS grace, no native context.
  bio.resetBiometricGrace();
  driver.coldStart();
  await new Promise((r) => setTimeout(r, 0));
  const perIntent: string[] = [];
  let total = 0;
  for (const intent of story.intents) {
    sheets.expo = 0;
    sheets.native = 0;
    await intent.run();
    const n = sheets.expo + sheets.native;
    total += n;
    perIntent.push(`${intent.name}=${String(n)}${sheets.native ? `(native ${String(sheets.native)})` : ''}`);
  }
  const line = JSON.stringify({ story: story.id, mode, key, total, intents: story.intents.length, perIntent });
  rows.push(line);
  console.log(`LEDGER ${line}`);
}

describe('Face ID prompt ledger', () => {
  for (const story of STORIES) {
    for (const mode of ['balanced', 'everyTime', 'redLineOnly'] as const) {
      for (const key of ['js-gated', 'native-acl (legacy SE)'] as const) {
        it(`${story.id} ${mode} ${key}`, async () => {
          await runStory(story, mode, key, process.env['LEDGER_PRIME'] === '1');
          expect(true).toBe(true);
        }, 120_000);
      }
    }
  }
});

afterAll(() => {
  void base64UrlEncode;
});
