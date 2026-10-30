import { describe, expect, it } from 'bun:test';

import {
  credentialTrustDisplayFor,
  credentialTrustSimpleI18nKeyForLevel,
  isRetiredPassportCredential,
} from '../../src/credentials/trustDisplay';

describe('credential trust display mapping', () => {
  // docs/ref/11 P2: ZK-era passport records were never bound to an issuing
  // state; whatever level they stored, they must not keep showing a badge.
  it('shows every retired ZK / fallback passport record as L1 and flags it for a rescan', () => {
    for (const subject of [
      { type: 'passport', trustLevel: 'L3+' as const, metadataTags: ['passport-openac-v3', 'passport-noir'] },
      { type: 'passport', trustLevel: 'L3' as const, metadataTags: ['passport-openac-v3', 'passport-openac-v3-no-aa'] },
      { type: 'passport', trustLevel: 'L2' as const, metadataTags: ['sd-jwt-fallback', 'fallback'] },
      { type: 'passport', trustLevel: 'L3' as const, metadataTags: ['mopro-noir'] },
    ]) {
      expect(credentialTrustDisplayFor(subject)).toMatchObject({ level: 'L1', tone: 'white' });
      expect(isRetiredPassportCredential(subject)).toBe(true);
    }
  });

  it('keeps the stored level of a passive-auth passport (L2 is not promoted to L3)', () => {
    const local = { type: 'passport', trustLevel: 'L2' as const, metadataTags: ['passport-passive-auth'] };
    expect(credentialTrustDisplayFor(local)).toMatchObject({ level: 'L2', tone: 'blue' });
    expect(isRetiredPassportCredential(local)).toBe(false);
    expect(
      credentialTrustDisplayFor({
        type: 'passport',
        trustLevel: 'L3',
        metadataTags: ['passport-passive-auth', 'passport-statement'],
      })
    ).toMatchObject({ level: 'L3', tone: 'blue', label: 'Level 3 - Device-attested passport' });
    expect(
      credentialTrustDisplayFor({ type: 'passport', trustLevel: 'L2', status: 'fallback' })
    ).toMatchObject({ level: 'L1' });
  });

  it('maps every tier to a simple surface label key, keeping fallback distinct', () => {
    expect(credentialTrustSimpleI18nKeyForLevel('L3+')).toBe('credentialTrust.simpleL3Plus');
    expect(credentialTrustSimpleI18nKeyForLevel('L3')).toBe('credentialTrust.simpleL3');
    expect(credentialTrustSimpleI18nKeyForLevel('L2')).toBe('credentialTrust.simpleL2');
    expect(credentialTrustSimpleI18nKeyForLevel('L1')).toBe('credentialTrust.simpleL1');
    // The technical tier labels stay reachable for the detail screen.
    expect(
      credentialTrustDisplayFor({ type: 'passport', trustLevel: 'L3+', metadataTags: [] }).label
    ).toBe('Level 3+ - Passport');
  });
});
