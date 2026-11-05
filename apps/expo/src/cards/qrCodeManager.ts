/**
 * Turns a QR-encodable string into a data: URL carrying an SVG. Inputs that
 * do not fit a real QR code reject: a text SVG is never a valid substitute
 * for a scannable QR.
 */
import { base64Encode, utf8ToBytes } from '@solidarity/shared';

type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

interface GenerateOptions {
  readonly size?: number;
  /**
   * Starting error-correction level for the cascade. Mirrors Swift's
   * `QRCodeGenerationService.generateImageCascading`:
   *   - `'H'` for plaintext envelopes (default — densest error correction
   *     when the payload fits, gracefully degrades for large payloads).
   *   - `'M'` for compressed ZK proofs.
   *   - `'L'` for didSigned JWTs (already long; aim for capacity headroom).
   * On exception, falls through `H → Q → M → L` until a level encodes.
   */
  readonly startingLevel?: ErrorCorrectionLevel;
}

interface QrCodeModule {
  toString(text: string, opts: { type: 'svg'; width?: number; margin?: number; errorCorrectionLevel?: ErrorCorrectionLevel }): Promise<string>;
}

let qrModuleCache: QrCodeModule | null = null;
let qrModuleFailed = false;

function loadQrModule(): QrCodeModule | null {
  if (qrModuleCache) return qrModuleCache;
  if (qrModuleFailed) return null;
  try {
    // `qrcode` ships no .d.ts in this version; cast through unknown so
    // the type system doesn't complain. Behaviour is verified at runtime
    // via the `toString` typeof guard below.
    const raw = require('qrcode') as { default?: QrCodeModule } & Partial<QrCodeModule>;
    const candidate = raw.default ?? (raw as QrCodeModule);
    if (typeof candidate.toString === 'function') {
      qrModuleCache = candidate;
      return qrModuleCache;
    }
    qrModuleFailed = true;
    return null;
  } catch {
    qrModuleFailed = true;
    return null;
  }
}

const CASCADE_LEVELS: readonly ErrorCorrectionLevel[] = ['H', 'Q', 'M', 'L'] as const;

/**
 * Render `value` as a QR code and return a `data:image/svg+xml;base64,…`
 * URL. Mirrors Swift's `QRCodeGenerationService.generateImageCascading`:
 * tries `opts.startingLevel` (default `'H'` — Swift's plaintext default)
 * then progressively lower error-correction levels in the order
 * `H → Q → M → L` until the payload fits. The underlying `qrcode` engine
 * throws `'The amount of data is too big to be stored in a QR Code'` when
 * capacity is exceeded; we catch that and step down one level.
 *
 * Caller hints (match Swift `encodeEnvelopeToImage`):
 *   - plaintext envelopes → `startingLevel: 'H'` (default)
 *   - compressed zkProof  → `startingLevel: 'M'`
 *   - didSigned JWT       → `startingLevel: 'L'`
 */
export async function generateQrPng(value: string, opts: GenerateOptions = {}): Promise<string> {
  const size = opts.size ?? 256;
  const startingLevel = opts.startingLevel ?? 'H';
  const mod = loadQrModule();
  if (!mod) {
    throw new Error('QR generation failed: QR encoder is unavailable on this device.');
  }

  const startIndex = Math.max(0, CASCADE_LEVELS.indexOf(startingLevel));
  let lastError: unknown = null;
  for (let i = startIndex; i < CASCADE_LEVELS.length; i += 1) {
    const level = CASCADE_LEVELS[i];
    try {
      const svg = await mod.toString(value, {
        type: 'svg',
        width: size,
        margin: 1,
        errorCorrectionLevel: level,
      });
      return `data:image/svg+xml;base64,${base64Encode(utf8ToBytes(svg))}`;
    } catch (err) {
      lastError = err;
      // Try the next (lower) correction level. `qrcode` throws
      // 'The amount of data is too big to be stored in a QR Code'
      // when the payload exceeds the chosen level's capacity.
    }
  }

  const detail = lastError instanceof Error ? ` (${lastError.message})` : '';
  throw new Error(`QR generation failed: payload could not fit in a QR code.${detail}`);
}
