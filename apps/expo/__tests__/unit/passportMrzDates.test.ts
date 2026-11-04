/**
 * MRZ YYMMDD century rules. Expiry and birth need different rules: a
 * passport issued since 2020 can expire 2030–2036, which the birth rule
 * read as 1930–1936 and rejected as expired.
 */
import { describe, expect, it } from 'bun:test';

import { mrzDate, validateMrzDraft } from '../../src/passport/pipeline';

const NOW = new Date(Date.UTC(2026, 10, 5, 12, 0, 0)); // 2026-11-05 12:00Z

const draft = (expiryDate: string) => ({
  passportNumber: 'X1234567',
  nationalityCode: 'TWN',
  dateOfBirth: '900101',
  expiryDate,
});

describe('validateMrzDraft expiry', () => {
  it('accepts a passport expiring in 2030', () => {
    expect(validateMrzDraft(draft('301231'), NOW)).toBeNull();
  });

  it('accepts a passport expiring today — valid through its expiry day', () => {
    expect(validateMrzDraft(draft('261105'), NOW)).toBeNull();
  });

  it('rejects a passport that expired yesterday', () => {
    expect(validateMrzDraft(draft('261104'), NOW)?.message).toBe('Passport appears to be expired.');
  });
});

const ymd = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

describe('mrzDate', () => {
  it.each([
    ['291231', '2029-12-31'],
    ['301231', '2030-12-31'],
    ['350101', '2035-01-01'],
    ['991231', '2099-12-31'],
  ])('expiry %s → %s', (mrz, iso) => {
    expect(ymd(mrzDate(mrz, 'expiry', NOW))).toBe(iso);
  });

  it.each([
    ['290101', '1929-01-01'],
    ['300101', '1930-01-01'],
    ['050101', '2005-01-01'],
    ['261105', '2026-11-05'], // born today
    ['261106', '1926-11-06'], // tomorrow can't be a birth date
  ])('birth %s → %s', (mrz, iso) => {
    expect(ymd(mrzDate(mrz, 'birth', NOW))).toBe(iso);
  });

  it.each(['30123', '3012AB', '301331', '300230'])('malformed %s → null', (mrz) => {
    expect(mrzDate(mrz, 'expiry', NOW)).toBeNull();
  });
});
