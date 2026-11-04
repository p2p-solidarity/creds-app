/**
 * DG1 → holder name for the private passport presentation (docs/ref/16 §11.4).
 *
 * Failure modes, listed before the code: a standard TD3 line 1; surname only;
 * several given names (single `<` between them); filler-only name field (the
 * simulated chip); shorter than 88 chars; lowercase / stray characters.
 */
import { describe, expect, it } from 'bun:test';

import { derivePassportName } from '../../src/passport/pipeline';

const line2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';
const td3 = (namesField: string): string => `P<UTO${namesField.padEnd(39, '<')}${line2}`;

describe('derivePassportName', () => {
  it('reads SURNAME<<GIVEN NAMES from TD3 line 1', () => {
    expect(derivePassportName(td3('ERIKSSON<<ANNA<MARIA'))).toBe('ERIKSSON ANNA MARIA');
  });

  it('keeps a surname-only name', () => {
    expect(derivePassportName(td3('TANAKA'))).toBe('TANAKA');
  });

  it('joins multi-part surnames', () => {
    expect(derivePassportName(td3('VAN<DER<BERG<<JAN'))).toBe('VAN DER BERG JAN');
  });

  it('returns null for a filler-only field (simulated chip)', () => {
    expect(derivePassportName(`P<JPN${'<'.repeat(39)}`.padEnd(88, '<'))).toBeNull();
  });

  it('returns null when DG1 is not a full TD3 MRZ', () => {
    expect(derivePassportName('P<UTOERIKSSON<<ANNA')).toBeNull();
    expect(derivePassportName('')).toBeNull();
  });

  it('ignores case and stray characters the same way the other DG1 readers do', () => {
    expect(derivePassportName(td3('eriksson<<anna').replace('P<UTO', 'P<UTO\n'))).toBe('ERIKSSON ANNA');
  });
});
