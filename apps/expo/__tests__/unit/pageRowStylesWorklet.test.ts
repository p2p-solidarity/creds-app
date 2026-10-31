/**
 * The drag-slot helpers (`dragDestinationForSlots`, `rowSlot`, `slotOffset`) are called synchronously inside `Gesture.Pan().onEnd`
 * worklets (ProfileLinksList / ProfileSectionsList), which run on the UI
 * runtime. A captured non-worklet function unpacks there as a stub that
 * throws — "[Worklets] Tried to synchronously call a non-worklet function" —
 * which terminates release builds the moment a drag handle is released.
 *
 * Bun tests never execute the UI runtime, so this asserts the invariant at
 * the artifact level instead: the app's worklets babel plugin must emit a
 * workletized helper (i.e. stamp `__workletHash` on each).
 * Dropping the `'worklet'` directive from any of them turns this red.
 */
import { describe, expect, it } from 'bun:test';
import { fileURLToPath } from 'node:url';

import { transformFileSync } from '@babel/core';

function transform(relativePath: string): string {
  const out = transformFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    {
      babelrc: false,
      configFile: false,
      presets: ['@babel/preset-typescript'],
      plugins: ['react-native-worklets/plugin'],
    },
  );
  return out?.code ?? '';
}

describe('pageRowStyles worklet contract', () => {
  it('workletizes the drag-slot helpers for the UI-runtime drag handles', () => {
    const code = transform('../../src/components/me/pageRowStyles.ts');
    expect(code).toMatch(/dragDestinationForSlots\.__workletHash\s*=/u);
    expect(code).toMatch(/rowSlot\.__workletHash\s*=/u);
    expect(code).toMatch(/slotOffset\.__workletHash\s*=/u);
  });

  it('workletizes the rowDrag helpers its pan worklets call synchronously', () => {
    const code = transform('../../src/components/me/rowDrag.tsx');
    expect(code).toMatch(/rubberClamp\.__workletHash\s*=/u);
    expect(code).toMatch(/settleBack\.__workletHash\s*=/u);
  });
});
