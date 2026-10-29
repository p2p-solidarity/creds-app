/**
 * Parity test — Semaphore group-root computation.
 *
 * Validates that the JS-layer `canonicalCommitments` helper produces
 * the same ordered list of decimal-string field elements that the Swift
 * `SemaphoreGroupManager` feeds into `Group::root()`. The actual
 * Pedersen-hash root derivation runs in the Rust binding; this suite
 * locks in the deterministic-ordering contract — sorting differences
 * would cause silent root drift across platforms.
 */
import { describe, expect, it } from 'bun:test';

import {
  canonicalCommitmentsRaw as canonicalCommitments,
  decimalStringToLittleEndian32,
  littleEndian32ToDecimalString,
} from '../../src/zk';

describe('Semaphore group canonicalisation parity', () => {
  it('orders the sorted set the same way for any input permutation', () => {
    const original = ['12', '5', '1234567890', '7', '7'];
    const a = canonicalCommitments(original);
    const b = canonicalCommitments([...original].reverse());
    expect([...a]).toEqual([...b]);
  });

  it('drops empty / whitespace commitments', () => {
    const out = canonicalCommitments(['', ' ', '\n', '\t', '0']);
    expect([...out]).toEqual(['0']);
  });

  it('preserves all-ones edge-case ordering', () => {
    // 1 < 10 < 2 lexicographically — the same ordering Swift gets from
    // `Array(Set(...)).sorted()`, which is also lex.
    const out = canonicalCommitments(['10', '1', '2']);
    expect([...out]).toEqual(['1', '10', '2']);
  });

  it('round-trips each canonical element through the LE32 encoder', () => {
    const set = canonicalCommitments(['1', '256', '999', '0']);
    for (const c of set) {
      const bytes = decimalStringToLittleEndian32(c);
      expect(littleEndian32ToDecimalString(bytes)).toBe(c);
    }
  });
});
