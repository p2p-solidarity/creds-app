/**
 * Notary E2E against a deployed notary (docs/ref/10 §7 P2): for each target,
 * NIP-98 sign a session, run the CLI prover (container/src/bin/prove.rs)
 * through the notary, pick the signed evidence up, then verify it offline with
 * the shared verifier and the pinned dev root. Also probes the live gate:
 * a replayed session header and an evidence pickup by another npub must fail.
 *
 *   NOTARY_ORIGIN=https://creds-notary-dev.<sub>.workers.dev PROVER=<path to prove> bun scripts/e2e.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildNip98Authorization, bytesToHex } from '@solidarity/shared';
import { signNostrEventWithScalar, type UnsignedNostrEvent } from '@solidarity/shared/nostr';
import {
  notaryEvidenceUrl,
  notarySessionUrl,
  profileTarget,
  verifyNotaryBundle,
  ZKTLS_PLATFORMS,
  type ZktlsPlatform,
} from '@solidarity/shared/zktls';

const origin = process.env['NOTARY_ORIGIN'];
const prover = process.env['PROVER'];
if (!origin || !prover) throw new Error('NOTARY_ORIGIN and PROVER are required');
const root = readFileSync(join(import.meta.dir, '..', 'keys', 'dev.root'), 'utf8').trim();

const TARGETS: { platform: ZktlsPlatform; handle: string }[] = [
  { platform: 'x', handle: 'jack' },
  { platform: 'telegram', handle: 'durov' },
  { platform: 'creds-name', handle: 'gimmy' },
];

function npubSigner(scalar: Uint8Array) {
  return async (unsigned: UnsignedNostrEvent) => signNostrEventWithScalar(unsigned, scalar);
}

async function auth(url: string, scalar: Uint8Array): Promise<string> {
  const header = await buildNip98Authorization(url, 'GET', null, npubSigner(scalar));
  if (!header.ok) throw new Error(header.error);
  return header.value;
}

async function prove(platform: ZktlsPlatform, handle: string, scalar: Uint8Array, stranger?: Uint8Array) {
  const sid = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const sessionUrl = notarySessionUrl(origin as string, { platform, handle, name: 'e2e', sid });
  const target = profileTarget(platform, handle);
  const field = ZKTLS_PLATFORMS[platform].field?.(handle);
  if (!target.ok || !field) throw new Error(`no rule for ${platform}`);
  const sessionAuth = await auth(sessionUrl, scalar);

  const started = performance.now();
  const run = Bun.spawnSync([prover as string], {
    env: {
      ...process.env,
      NOTARY_URL: sessionUrl.replace(/^https:/u, 'wss:'),
      NOTARY_AUTH: sessionAuth,
      TARGET_HOST: target.value.server,
      TARGET_PATH: target.value.request.split(' ')[1] as string,
      FIND: field.start,
      FIND_END: field.stop,
    },
  });
  const proverOut = run.stdout.toString().trim();
  if (run.exitCode !== 0) throw new Error(`prover failed: ${run.stderr.toString().trim()}`);

  const evidenceUrl = notaryEvidenceUrl(origin as string, sid);
  let strangerPickup: number | null = null;
  if (stranger) {
    strangerPickup = (await fetch(evidenceUrl, { headers: { Authorization: await auth(evidenceUrl, stranger) } })).status;
  }
  const res = await fetch(evidenceUrl, { headers: { Authorization: await auth(evidenceUrl, scalar) } });
  const body = (await res.json()) as { cert: string; evidence: string; error?: string };
  const elapsed = Math.round(performance.now() - started);
  if (res.status !== 200) throw new Error(`evidence ${res.status} ${body.error}`);
  const verified = verifyNotaryBundle(body, { roots: [root] });
  return { sessionUrl, sessionAuth, proverOut, elapsed, verified, strangerPickup, bundleBytes: body.cert.length + body.evidence.length };
}

const scalar = crypto.getRandomValues(new Uint8Array(32));
const stranger = crypto.getRandomValues(new Uint8Array(32));
let failures = 0;

for (const { platform, handle } of TARGETS) {
  try {
    const r = await prove(platform, handle, scalar, platform === 'telegram' ? stranger : undefined);
    if (!r.verified.ok) {
      failures++;
      console.log(`FAIL ${platform}/${handle}: offline verify ${r.verified.error}`);
      continue;
    }
    const v = r.verified.value;
    console.log(`OK   ${platform}/${handle} in ${r.elapsed} ms (prover ${r.proverOut}); bundle ${r.bundleBytes} B; key ${v.notaryKey.slice(0, 20)}…`);
    console.log(`     revealed: ${v.revealedValue.slice(0, 120)}`);

    if (platform === 'telegram') {
      const replay = await fetch(r.sessionUrl, { headers: { Authorization: r.sessionAuth } });
      const replayBody = (await replay.json()) as { error: string };
      const gateOk = replay.status === 401 && replayBody.error === 'replayed' && r.strangerPickup === 404;
      if (!gateOk) failures++;
      console.log(`${gateOk ? 'OK  ' : 'FAIL'} gate: replay → ${replay.status} ${replayBody.error}; other npub pickup → ${r.strangerPickup}`);
    }
  } catch (e) {
    failures++;
    console.log(`FAIL ${platform}/${handle}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
process.exit(failures === 0 ? 0 : 1);
