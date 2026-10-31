import { describe, expect, it } from 'bun:test';

import {
  normalizePublicPageUsernameInput,
  publicPagePath,
  validatePublicPageUsername,
} from '../../src/onboarding/publicPageUsername';

describe('public page username', () => {
  it('normalizes to lowercase ASCII letters and numbers', () => {
    expect(normalizePublicPageUsernameInput(' Gim_My-26! ')).toBe('gimmy26');
  });

  it('requires 3–30 characters and rejects reserved product paths', () => {
    expect(validatePublicPageUsername('ab')).toEqual({ kind: 'tooShort' });
    expect(validatePublicPageUsername('a'.repeat(31))).toEqual({ kind: 'tooLong' });
    expect(validatePublicPageUsername('settings')).toEqual({ kind: 'reserved' });
    expect(validatePublicPageUsername('gimmy26')).toEqual({ kind: 'valid' });
  });

  it('uses the official short @name path without a long identifier', () => {
    expect(publicPagePath('gimmy26')).toBe('creds.id/@gimmy26');
  });
});
