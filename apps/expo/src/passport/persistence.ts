import { bytesToHex, sha256Bytes } from '@solidarity/shared';

import type { PassportMRZDraft } from './pipeline';

const PASSPORT_FINGERPRINT_DOMAIN = 'solidarity.passport.mrz-key.v1';

export const PASSPORT_FINGERPRINT_TAG_PREFIX = 'passport-fingerprint:';

export function derivePassportFingerprint(
  draft: Pick<PassportMRZDraft, 'passportNumber' | 'nationalityCode' | 'dateOfBirth' | 'expiryDate'>
): string {
  const canonical = [
    PASSPORT_FINGERPRINT_DOMAIN,
    normalizeMrzField(draft.nationalityCode),
    normalizeMrzField(draft.passportNumber),
    normalizeMrzField(draft.dateOfBirth),
    normalizeMrzField(draft.expiryDate),
  ].join('|');
  return bytesToHex(sha256Bytes(canonical));
}

export function passportFingerprintTag(fingerprint: string): string {
  return `${PASSPORT_FINGERPRINT_TAG_PREFIX}${fingerprint.trim().toLowerCase()}`;
}

function normalizeMrzField(value: string): string {
  return value.replace(/\s+/gu, '').toUpperCase();
}
