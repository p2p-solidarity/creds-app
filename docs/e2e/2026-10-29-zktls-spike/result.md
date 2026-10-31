# P0 zkTLS spike — 2026-10-29

Plan: `docs/ref/10-plan-simplify-and-verify.md` §7 P0. Throwaway code is on branch `spike/zktls-p0`
(`spikes/zktls-p0/`). TLSNotary pinned to `v0.1.0-alpha.15` (needs rustc 1.95). Everything below was
actually run on 2026-10-29 unless marked **paper**. All spike Workers/Containers were deleted afterwards.

## Verdict

1. **zkTLS on real public profiles works.** Proxy-mode TLSNotary proved the bio meta tag of X, Telegram,
   Threads, LinkedIn and GitHub end to end: prover on a Mac → internet → notary in a **Cloudflare
   Container** (Gimmy account, NRT) → the real site. 2.0–4.6 s per proof, ~0.5–0.8 MB up / 1–3 MB down.
2. **The notary must be a Container, not a Worker.** Workers TCP sockets cannot connect to Cloudflare IP
   ranges, and x.com, t.co and linkedin.com sit behind Cloudflare. A Worker notary can never reach X.
   (The tlsn WASM verifier also needs browser Web Workers for threads, which Workers don't have.)
3. **Instagram is not solved.** Container egress gets a login redirect; only Worker-socket egress reaches
   the bio, and a Worker can't run the verifier. Follow-up idea (untested): let the Container dial
   Instagram through a Worker `connect()` relay.
4. **X rewrites every URL in a bio to `t.co`.** The pretty marker still works with a second proof:
   "x.com/<name> bio contains t.co/XYZ" + "t.co/XYZ's page names creds.id/@name" (1.6 s, proven below).
5. **iOS prover builds**: `tlsn-mobile` cross-compiles for `aarch64-apple-ios` in ~3 min
   (static lib 76 MB before linking). **Not measured on a phone** — no physical device was connected.
6. **Pear as the in-person transport is feasible but unbuilt** (paper, see ④).

## ① Proxy-mode proofs, end to end through the Container notary

Command (from `spikes/zktls-p0/vendor/tlsn`):
`NOTARY_WS=wss://<notary>/ TARGET_URL=<url> FIND=<meta prefix> ./target/release/examples/social`.
The prover reveals the full request and only the bio meta tag; the notary dials the host the prover
committed to and forwards ciphertext.

| Target | Response | Total | ws connect | TLS+HTTP | prove | prover↔notary up / down |
|---|---|---|---|---|---|---|
| x.com/jack (cold container) | 186 KB | 3.51 s | 1.29 s | 0.61 s | 0.08 s | 582 KB / 1726 KB |
| x.com/jack | 186 KB | 2.84 s | 0.17 s | 0.68 s | 0.09 s | 584 KB / 1726 KB |
| x.com/jack | 186 KB | 2.36 s | 0.22 s | 0.75 s | 0.06 s | 581 KB / 1726 KB |
| x.com/jack | 186 KB | 3.25 s | 0.20 s | 0.82 s | 0.08 s | 584 KB / 1726 KB |
| t.me/durov | 11 KB | 2.51 s | 0.15 s | 1.13 s | 0.09 s | 525 KB / 1021 KB |
| threads.com/@zuck | 1.31 MB | 4.65 s | 0.13 s | 2.05 s | 0.44 s | 810 KB / 2964 KB |
| linkedin.com/in/williamhgates | 663 KB | 3.08 s | 0.16 s | 1.20 s | 0.36 s | 630 KB / 2663 KB |
| github.com/torvalds | 183 KB | 2.06 s | 0.15 s | 0.67 s | 0.23 s | 539 KB / 1657 KB |
| t.co/t0MrmnJW0K (X link hop) | 1.4 KB | 1.63 s | 0.15 s | 0.32 s | 0.08 s | 525 KB / 1010 KB |

Same binary with prover and verifier in one process (no network between them): X 0.68 s, Telegram
1.29 s; what the verifier received, e.g. `server: x.com`, revealed
`<meta name="description" content="no state is the best state`, and for the t.co hop
`server: t.co`, revealed `<title>https://fedi.simonwillison.net/@simon`.

Caveats: the prover ran on an Apple-silicon Mac on home broadband, so phone CPU and cellular latency
are not reflected. The ~1.4 s not covered by the timing columns is session setup (proxy-mode ZK
preprocessing) before the TLS handshake.

## ② Verifier as WASM in a Worker — dropped

- `crates/wasm` exposes a proxy-mode `JsVerifier` (`setup` → `set_server_socket` → `run` → `verify`),
  but it depends on `web-spawn` (browser Web Workers) for threading; Cloudflare Workers have no such API.
- Moot anyway: a Worker can't open a socket to X or LinkedIn (③). Not pursued further.

## ③ Can Cloudflare egress read each platform's public profile?

Probes: `egress-worker` (Worker `fetch()` + raw `connect()`), `egress-container` (Container, raw
`tls.connect`, TLS 1.2). Three runs each, identical results.

| Platform | Worker `fetch()` | Worker raw socket | Container raw socket |
|---|---|---|---|
| X `x.com/<name>` | 200, bio ✓ | **blocked** (behind Cloudflare) | 200, bio ✓ |
| Telegram `t.me/<name>` | 200 ✓ | 200 ✓ | 200 ✓ |
| Threads | 200 ✓ | 200 ✓ | 200 ✓ |
| LinkedIn | 999 (blocked) | **blocked** (behind Cloudflare) | 200, bio ✓ |
| Instagram | 302 → login | 200, bio ✓ | **302 → login** |
| GitHub | 200 ✓ | 200 ✓ | 200 ✓ |
| YouTube | 302 `www`→`m.` | 302 `www`→`m.` | 200 on `m.youtube.com` (bio check weak) |

All targets negotiate TLS 1.2 with AES-GCM (TLSNotary's requirement).

## ④ TLSNotary over Pear (in-person witness) — paper

- Pear lane today is length-prefixed JSON frames capped at `FRAME_MAX_BYTES = 64 KB`
  (`apps/expo/src/pear/frames.ts`), relayed RN ↔ Bare worklet ↔ Noise socket.
- A proxy session moves ~1.5–3.5 MB, i.e. ~25–55 frames, across three hops.
- Needed and not present: (a) a verifier UniFFI binding (`tlsn-mobile` exports prover only:
  `prove`, `prove_until_reveal`, `prove_finalize`); (b) a byte-stream IO bridge into Rust (today it
  dials a WebSocket in `ws_io.rs`); (c) a binary channel on the Pear connection.
- Stays in plan phase P2.5.

## ⑤ X and `t.co`

- Logged-out `x.com/<name>` serves the bio as `<meta name="description">`. Every URL in a bio —
  including bare domains — appears as `https://t.co/…` (e.g. `simonw`: `Mastodon: https://t.co/t0MrmnJW0K`).
- `t.co/<id>` answers a browser UA with a 200 page whose `<title>` is the destination URL (and a 301
  `Location` for non-browser UAs). Proving that page (1.6 s) links the bio to `creds.id/@name`.
- Not yet tried with a real `creds.id/@name` in a bio — needs an X account we control.

## Plan changes this forces (docs/ref/10)

- §3.1 notary: **Cloudflare Container** (durable_object scheduling — this account rejects the default
  policy), fronted by a Worker for the WebSocket; the Worker+DO-only path is closed.
- §3.3 MPC fallback can live in the same Container if needed.
- §3.9 Instagram: no notary layer until the Worker-relay idea is tested; App-remote and in-person still work.
- §2/§3.5 X: marker proof is two hops (x.com bio → t.co → creds.id/@name).
