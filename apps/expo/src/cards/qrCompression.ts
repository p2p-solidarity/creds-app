/**
 * `sce1:` zlib QR compression — compatible with QR codes the old Swift app
 * produced.
 *
 * Wire format (must round-trip bit-for-bit):
 *   `sce1:` + base64url( DEFLATE(data) )
 *
 * Apple's `COMPRESSION_ZLIB` is **raw DEFLATE (RFC 1951)** — i.e. no zlib
 * header, no adler32 trailer. fflate's `deflateSync` / `inflateSync` produce
 * exactly that (the d.ts says: "Compresses data with DEFLATE without any
 * wrapper"). So we use those — NOT `zlibSync` / `unzlibSync`, which would
 * prepend the 2-byte zlib header + 4-byte adler32 and break Swift decode.
 *
 * Caps:
 *   - `MAX_QR_REASSEMBLED_BYTES` = 256 KiB
 *     (`QRCodeChunkingService.maxReassembledPayloadBytes` in Swift)
 *   - Both compressed input and decompressed output are bounded by this cap
 *     so a malicious QR cannot trigger a multi-MB allocation (zip-bomb).
 *
 * Behavioural parity:
 *   - `compressForQR` returns null if the framed `sce1:…` string isn't
 *     shorter than the source byte length (no point spending bytes on
 *     compression). Matches Swift `guard result.count < sourceSize`.
 *   - `decompressQR` returns null on any of: missing prefix, bad base64url,
 *     compressed size > cap, inflate throws, output >= cap (would-be
 *     truncation).
 */
import { deflateSync, inflateSync } from 'fflate';

import { base64UrlDecode, base64UrlEncode, utf8ToBytes } from '@solidarity/shared';

/**
 * 256 KiB.
 * Used as both the compressed-input cap and the decompressed-output cap.
 */
export const MAX_QR_REASSEMBLED_BYTES = 256 * 1024;

const SCE1_PREFIX = 'sce1:';

/**
 * Compress `data` for QR transport.
 *
 * Returns `sce1:<base64url(deflate(data))>` or null if:
 *   - inflate-produced framed string is not strictly shorter than source
 *     (compression wouldn't help — emit the raw payload instead),
 *   - deflate throws.
 *
 * Strings are UTF-8 encoded first.
 */
export function compressForQR(data: Uint8Array | string): string | null {
  const source = typeof data === 'string' ? utf8ToBytes(data) : data;
  const sourceSize = source.length;
  if (sourceSize === 0) return null;

  let compressed: Uint8Array;
  try {
    compressed = deflateSync(source);
  } catch {
    return null;
  }
  if (compressed.length === 0) return null;

  const encoded = base64UrlEncode(compressed);
  const result = `${SCE1_PREFIX}${encoded}`;
  // Swift: `guard result.count < sourceSize` — strictly less than.
  if (result.length >= sourceSize) return null;
  return result;
}

/**
 * Decompress an `sce1:`-prefixed string back to bytes.
 *
 * Returns null on any wire-format, length, or inflate failure. Output is
 * bounded by `MAX_QR_REASSEMBLED_BYTES`; outputs that would hit the cap are
 * rejected (we cannot distinguish "exactly cap bytes" from "truncated to
 * cap bytes", so we reject both — matches Swift's
 * `guard decompressedSize < maxDecompressedQRSize`).
 */
export function decompressQR(payload: string): Uint8Array | null {
  if (typeof payload !== 'string') return null;
  if (!payload.startsWith(SCE1_PREFIX)) return null;

  const encoded = payload.slice(SCE1_PREFIX.length);
  if (encoded.length === 0) return null;

  let compressed: Uint8Array;
  try {
    compressed = base64UrlDecode(encoded);
  } catch {
    return null;
  }

  if (compressed.length === 0) return null;
  if (compressed.length > MAX_QR_REASSEMBLED_BYTES) return null;

  // Allocate cap+1 so we can detect "filled to brim" → truncation / oversize.
  const out = new Uint8Array(MAX_QR_REASSEMBLED_BYTES + 1);
  let written: Uint8Array;
  try {
    written = inflateSync(compressed, { out });
  } catch {
    return null;
  }

  if (written.length === 0) return null;
  // Swift rejects when decompressedSize == cap; we mirror that. If the
  // returned buffer hit the cap-or-above, the input was at-or-over the budget.
  if (written.length >= MAX_QR_REASSEMBLED_BYTES) return null;

  // `out` is a buffer the caller may want to detach from — copy into a
  // freshly-allocated, tightly-sized Uint8Array to avoid leaking the cap+1
  // backing buffer.
  return Uint8Array.from(written);
}
