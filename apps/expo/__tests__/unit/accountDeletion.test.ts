import { describe, expect, test } from 'bun:test';

import { runAccountDeletion, type AccountDeletionDeps, type StepRunResult } from '@/account/accountDeletion';
import { planNostrErasure } from '@/account/nostrErasure';
import type { NostrEvent } from '@/nostr/nostrAdapter';

const ok = (): Promise<StepRunResult> => Promise.resolve({ kind: 'done' });

function deps(overrides: Partial<AccountDeletionDeps>, localCalls: { n: number }): AccountDeletionDeps {
  return {
    nostr: ok, name: ok, vault: ok, pro: ok, inbox: ok,
    local: () => { localCalls.n += 1; return ok(); },
    ...overrides,
  };
}

describe('runAccountDeletion', () => {
  test('keeps the keys on the phone when any server step fails or throws', async () => {
    for (const failing of [
      { name: () => Promise.resolve<StepRunResult>({ kind: 'failed' }) },
      { vault: () => Promise.reject(new Error('network')) },
    ]) {
      const local = { n: 0 };
      const result = await runAccountDeletion(deps(failing, local));
      expect(result.kind).toBe('incomplete');
      expect(local.n).toBe(0);
      expect(result.steps.local).toEqual({ kind: 'notRun' });
    }
  });

  test('is deleted only after every server step and the local wipe went through', async () => {
    const local = { n: 0 };
    const result = await runAccountDeletion(deps({ inbox: () => Promise.resolve({ kind: 'nothing' }) }, local));
    expect(result.kind).toBe('deleted');
    expect(local.n).toBe(1);
    const failedWipe = await runAccountDeletion(deps({ local: () => Promise.resolve({ kind: 'failed' }) }, local));
    expect(failedWipe).toMatchObject({ kind: 'incomplete', failed: ['local'] });
  });
});

const PK = 'a'.repeat(64);
const ev = (id: string, kind: number, tags: string[][], content = '', pubkey = PK): NostrEvent =>
  ({ id, pubkey, kind, tags, content, created_at: 1, sig: '' }) as NostrEvent;

describe('planNostrErasure', () => {
  test('targets only records in our namespace, never the person\'s other Nostr data', () => {
    const plan = planNostrErasure(PK, [
      ev('page', 30078, [['d', 'solidarity.profile']]),
      ev('witness', 30078, [['d', 'creds.witness:x:y']]),
      ev('otherApp', 30078, [['d', 'com.other.settings']]),
      ev('forged', 30078, [['d', 'solidarity.profile']], '', 'b'.repeat(64)),
    ], ev('k0', 0, [], JSON.stringify({ name: 'Ann', nip05: 'ann@creds.id', alsoKnownAs: ['did:key:z1', 'at://ann'] })));

    expect(plan.replacements).toEqual([
      { kind: 30078, tags: [['d', 'solidarity.profile']], content: '' },
      { kind: 30078, tags: [['d', 'creds.witness:x:y']], content: '' },
      { kind: 0, tags: [], content: JSON.stringify({ name: 'Ann', alsoKnownAs: ['at://ann'] }) },
    ]);
    const tags = plan.deletion?.tags ?? [];
    expect(tags.filter((t) => t[0] === 'e').map((t) => t[1])).toEqual(['page', 'witness']);
    expect(tags).toContainEqual(['a', `30078:${PK}:solidarity.profile`]);
  });

  test('asks to delete a kind 0 only when nothing but our fields was in it', () => {
    const plan = planNostrErasure(PK, [], ev('k0', 0, [], JSON.stringify({ alsoKnownAs: ['did:key:z1'] })));
    expect(plan.replacements).toEqual([{ kind: 0, tags: [], content: '{}' }]);
    expect(plan.deletion?.tags).toContainEqual(['e', 'k0']);
    expect(planNostrErasure(PK, [], ev('k0', 0, [], JSON.stringify({ name: 'Ann' })))).toEqual({ replacements: [], deletion: null });
  });
});
