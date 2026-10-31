import { describe, expect, it } from 'bun:test';

import type { PassportMRZDraft } from '../../src/passport/pipeline';
import {
  PASSPORT_FINGERPRINT_TAG_PREFIX,
  derivePassportFingerprint,
  passportFingerprintTag,
} from '../../src/passport/persistence';

const MRZ: PassportMRZDraft = {
  passportNumber: 'L898902C36',
  nationalityCode: 'UTO',
  dateOfBirth: '740812',
  expiryDate: '120415',
};

describe('passport persistence duplicate guard', () => {
  it('derives a stable MRZ-key fingerprint from normalized passport fields', () => {
    const fingerprint = derivePassportFingerprint(MRZ);
    const samePassportDifferentInputCase = derivePassportFingerprint({
      passportNumber: ' l898902c36 ',
      nationalityCode: ' uto ',
      dateOfBirth: '740812',
      expiryDate: '120415',
    });

    expect(fingerprint).toBe('6a3e6dc2aaaf985d75757c39ac3344bb61b033633868d5e21b8137cb7a06ae88');
    expect(samePassportDifferentInputCase).toBe(fingerprint);
    expect(passportFingerprintTag(fingerprint)).toBe(
      `${PASSPORT_FINGERPRINT_TAG_PREFIX}${fingerprint}`
    );
  });

});
