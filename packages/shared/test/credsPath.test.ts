/**
 * One top-level creds.id path segment → what it is (docs/ref/15 §2.1).
 * Failure modes, each must NOT read as a person:
 *   - a site word (`edit`), in any case
 *   - a dotted / hyphenated / underscored / too short / too long word
 *   - an empty segment or a bare `@`
 */
import { describe, expect, test } from 'bun:test';

import { CREDS_NAME_RE, RESERVED_NAMES, classifyCredsPathSegment } from '../src/handles/credsPath';

describe('classifyCredsPathSegment', () => {
  test.each([
    ['alice', { kind: 'name', name: 'alice', canonical: true }],
    ['Alice', { kind: 'name', name: 'alice', canonical: false }],
    ['a1b', { kind: 'name', name: 'a1b', canonical: true }],
    ['a'.repeat(30), { kind: 'name', name: 'a'.repeat(30), canonical: true }],
    ['edit', { kind: 'reserved', word: 'edit' }],
    ['EDIT', { kind: 'reserved', word: 'edit' }],
    ['@alice', { kind: 'handle', handle: 'alice' }],
    ['@alice.bsky.social', { kind: 'handle', handle: 'alice.bsky.social' }],
    ['@dns:example.com', { kind: 'handle', handle: 'dns:example.com' }],
    ['@', { kind: 'other' }],
    ['', { kind: 'other' }],
    ['al', { kind: 'other' }],
    ['a'.repeat(31), { kind: 'other' }],
    ['alice.eth', { kind: 'other' }],
    ['alice-x', { kind: 'other' }],
    ['alice_x', { kind: 'other' }],
    ['llms.txt', { kind: 'other' }],
  ])('%p', (segment, expected) => {
    expect(classifyCredsPathSegment(segment)).toEqual(expected as ReturnType<typeof classifyCredsPathSegment>);
  });
});

describe('RESERVED_NAMES', () => {
  test('is the 199-word table, every word name-shaped', () => {
    expect(RESERVED_NAMES.size).toBe(199);
    for (const word of RESERVED_NAMES) expect(CREDS_NAME_RE.test(word)).toBe(true);
  });
});
