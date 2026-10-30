/**
 * Passport pipeline — NFC read strategy.
 */
import { describe, expect, it } from 'bun:test';

import { selectNfcReadStrategy } from '../../src/passport/pipeline';

// ---------------------------------------------------------------------------
// selectNfcReadStrategy — guarantees production builds never silently fall
// back to the simulated chip. Mirrors Swift PassportPipelineService
// .shouldSimulateNFC (DeveloperModeManager.isDeveloperMode &&
// .simulateNFC) plus the explicit "no NFC hardware" rejection path.
// ---------------------------------------------------------------------------

describe('selectNfcReadStrategy', () => {
  it('returns `real` when production build + bridge linked + hardware available', () => {
    const s = selectNfcReadStrategy({
      nitroLinked: true,
      hardwareAvailable: true,
      developerMode: false,
      simulateNfc: false,
    });
    expect(s.kind).toBe('real');
  });

  it('returns `unavailable/module-missing` in production when the Nitro module isnt linked', () => {
    // Most common cause of the "real chip tap returns null" symptom on
    // device — the Nitro HybridObject failed to register so the screen
    // would previously fall back to a mock chip without telling the user.
    // The strategy now surfaces this as a typed error.
    const s = selectNfcReadStrategy({
      nitroLinked: false,
      hardwareAvailable: false,
      developerMode: false,
      simulateNfc: false,
    });
    expect(s.kind).toBe('unavailable');
    if (s.kind === 'unavailable') {
      expect(s.reason).toBe('module-missing');
      expect(s.message).toMatch(/rebuild|pod install/i);
    }
  });

  it('returns `unavailable/hardware-unavailable` in production on iOS Simulator', () => {
    // iOS Simulator returns isAvailable=false because Core NFC refuses to
    // start. We must NOT switch to a synthetic chip — show the user a
    // clear error instead.
    const s = selectNfcReadStrategy({
      nitroLinked: true,
      hardwareAvailable: false,
      developerMode: false,
      simulateNfc: false,
    });
    expect(s.kind).toBe('unavailable');
    if (s.kind === 'unavailable') {
      expect(s.reason).toBe('hardware-unavailable');
      expect(s.message).toMatch(/physical|iphone/i);
    }
  });

  it('returns `simulated` only when developer mode + simulateNfc are both on', () => {
    const s = selectNfcReadStrategy({
      nitroLinked: false,
      hardwareAvailable: false,
      developerMode: true,
      simulateNfc: true,
    });
    expect(s.kind).toBe('simulated');
    if (s.kind === 'simulated') expect(s.reason).toBe('developer-mode');
  });

  it('does NOT simulate when developer mode is on but the simulateNfc toggle is off', () => {
    const s = selectNfcReadStrategy({
      nitroLinked: true,
      hardwareAvailable: false,
      developerMode: true,
      simulateNfc: false,
    });
    expect(s.kind).toBe('unavailable');
  });

  it('prefers `real` over the developer-mode toggle when only developerMode is true', () => {
    // Defensive: developer mode alone should not flip a working device
    // into mock mode — both flags are required.
    const s = selectNfcReadStrategy({
      nitroLinked: true,
      hardwareAvailable: true,
      developerMode: true,
      simulateNfc: false,
    });
    expect(s.kind).toBe('real');
  });
});

