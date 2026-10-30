# 2026-10-31 — Request proof 閃退: worklet terminated with live sockets

## Reported
Request proof (Pear, 請求證明) still closes the app, after 547a3537 routed worklet rejections to RN.

## Root cause (from code; no device crash log — XR was unavailable)
- Every Pear flow tears its lane down at a terminal phase: `releaseLane` → `lane.shutdown()` →
  `worklet.terminate()`, synchronously, with the hyperswarm topic and its socket still live.
- `react-native-bare-kit` 0.15.6 `shared/BareKitModule.cc` `terminate()` runs `bare_ipc_poll_destroy(poll)` +
  `free(poll)` while the worklet thread can still be inside `on_poll_` for that handle (it fires whenever
  the worklet writes to IPC) — a native use-after-free. No JS handler or error boundary can catch it.
- Request proof reaches that state fastest: the peer's passport claims never match (their record is JSON, not
  a JWT), so it auto-declines within milliseconds of the handshake and the requester terminates while the
  connection is still busy. Card request waits on the peer's consent tap, so its socket is usually quiet.

## Fix
`lane.shutdown()` now sends `_leave` for every joined topic (the worklet destroys its sockets and swarm),
stops listening, and calls `worklet.terminate()` only after `LANE_TERMINATE_GRACE_MS` (1.5 s). Applies to
every Pear flow (card request, mutual exchange, request proof, reachable mode, background sweep).

## Ran
- `bun test pearLane pearLaneManager` — 36 pass; new regression test: shutdown leaves topics first and does
  not terminate synchronously.

## Not run
- Request proof between two real phones (a simulator can't pair with itself; XR unavailable). This is the
  final gate — if it still closes, pull the .ips: `idevicecrashreport -u <UDID> -k /tmp/xr-crashes`.
