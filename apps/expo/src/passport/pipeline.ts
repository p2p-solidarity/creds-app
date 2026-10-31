/**
 * Passport pipeline — the passport-setup screen's state machine:
 *
 *   mrz ──validateMRZ──→ nfc ──readNFCChip──→ persist
 *
 *   - mrz     → needs a validated PassportMRZDraft
 *   - nfc     → needs a PassportChipSnapshot (real chip, passive auth done
 *               natively; or the developer-mode simulation)
 *   - persist → saves the credential and signs the device-attested passport
 *               statement (handled by the calling screen, docs/ref/11 §6.1)
 *
 * There is no proof step: the app no longer proves anything about the
 * passport in a circuit (docs/ref/11 P2).
 */
import type { PassportReadResult } from '@solidarity/nitro-attest';

// ---------------------------------------------------------------------------
// Chip-snapshot helpers — mirror Swift PassportPipelineService.realNFCRead +
// simulatedNFCRead. Live here (not in the React page) so the masking /
// digest logic can be unit-tested without spinning up the Nitro bridge.
// ---------------------------------------------------------------------------

export type PassportPipelineStep = 'mrz' | 'nfc' | 'persist';

export interface PassportMRZDraft {
  readonly passportNumber: string;
  readonly nationalityCode: string;
  /** YYMMDD per ICAO 9303. */
  readonly dateOfBirth: string;
  /** YYMMDD per ICAO 9303. */
  readonly expiryDate: string;
}

export interface PassportChipSnapshot {
  readonly documentHash: string;
  readonly mrzDigest: string;
  readonly mrz: PassportReadResult['mrz'];
  readonly dg1MRZData: string;
  readonly dataGroups?: PassportReadResult['dataGroups'];
  readonly chipUid: string;
  readonly bacVerified: boolean;
  readonly paceVerified: boolean;
  readonly passiveAuthValid: boolean;
  readonly passiveAuthPassed: boolean;
  readonly isSimulated: boolean;
  readonly readAt: Date;
  readonly nationalityCode: string;
  readonly maskedDocNumber: string;
  readonly dataGroupsRead: readonly string[];
}

export interface ValidationError {
  readonly kind: 'validation';
  readonly message: string;
}

/**
 * Validate the user-entered MRZ draft. Mirrors Swift
 * `PassportPipelineService.validateMRZ` (passport ≥ 6 chars,
 * 3-letter nationality, expiry > today).
 */
export function validateMrzDraft(draft: PassportMRZDraft): ValidationError | null {
  const passport = draft.passportNumber.trim();
  const nationality = draft.nationalityCode.trim();
  if (passport.length < 6) {
    return { kind: 'validation', message: 'Passport number is too short.' };
  }
  if (nationality.length !== 3) {
    return { kind: 'validation', message: 'Nationality code must be 3 letters.' };
  }
  const expiryDate = parseYyMmDd(draft.expiryDate);
  if (expiryDate && expiryDate.getTime() <= Date.now()) {
    return { kind: 'validation', message: 'Passport appears to be expired.' };
  }
  return null;
}

function parseYyMmDd(s: string): Date | null {
  if (s.length !== 6) return null;
  const yy = Number(s.slice(0, 2));
  const mm = Number(s.slice(2, 4));
  const dd = Number(s.slice(4, 6));
  if (Number.isNaN(yy) || Number.isNaN(mm) || Number.isNaN(dd)) return null;
  const fullYear = yy >= 30 ? 1900 + yy : 2000 + yy;
  return new Date(Date.UTC(fullYear, mm - 1, dd));
}

/** Mask the document number for display — keeps first 2 + last 1 chars. */
export function maskDocumentNumber(raw: string): string {
  if (raw.length <= 3) return raw;
  return raw.slice(0, 2) + '*'.repeat(raw.length - 3) + raw.slice(-1);
}

export interface PassportPipelineState {
  readonly step: PassportPipelineStep;
  readonly draft: PassportMRZDraft;
  readonly chip: PassportChipSnapshot | null;
  readonly isLoading: boolean;
  readonly nfcProgressMessage: string;
  /** 0..100, mirrors the native NfcReadProgress.percent we receive. */
  readonly nfcProgressPercent: number;
  /** Coarse phase from the native callback — drives bar colour / icon. */
  readonly nfcProgressPhase:
    | 'idle'
    | 'connecting'
    | 'authenticating'
    | 'reading-dg'
    | 'verifying'
    | 'done'
    | 'error';
  readonly errorMessage: string | null;
}

export const initialPassportPipelineState: PassportPipelineState = {
  step: 'mrz',
  draft: {
    passportNumber: '',
    nationalityCode: 'TWN',
    dateOfBirth: '',
    expiryDate: '',
  },
  chip: null,
  isLoading: false,
  nfcProgressMessage: 'Connecting to chip...',
  nfcProgressPercent: 0,
  nfcProgressPhase: 'idle',
  errorMessage: null,
};

export type PassportPipelineAction =
  | { readonly type: 'setDraft'; readonly draft: PassportMRZDraft }
  | { readonly type: 'patchDraft'; readonly patch: Partial<PassportMRZDraft> }
  | { readonly type: 'gotoStep'; readonly step: PassportPipelineStep }
  | { readonly type: 'setLoading'; readonly value: boolean }
  | { readonly type: 'setNfcProgress'; readonly message: string }
  | {
      readonly type: 'setNfcProgressEvent';
      readonly phase: PassportPipelineState['nfcProgressPhase'];
      readonly percent: number;
      readonly message: string;
    }
  | { readonly type: 'setChip'; readonly chip: PassportChipSnapshot }
  | { readonly type: 'setError'; readonly message: string | null };

export function passportPipelineReducer(
  state: PassportPipelineState,
  action: PassportPipelineAction
): PassportPipelineState {
  switch (action.type) {
    case 'setDraft':
      return { ...state, draft: action.draft };
    case 'patchDraft':
      return { ...state, draft: { ...state.draft, ...action.patch } };
    case 'gotoStep':
      return { ...state, step: action.step };
    case 'setLoading':
      return { ...state, isLoading: action.value };
    case 'setNfcProgress':
      return { ...state, nfcProgressMessage: action.message };
    case 'setNfcProgressEvent':
      // `percent` is clamped to monotonic non-decreasing for the UI so an
      // out-of-order callback (rare but possible across native → JS hops)
      // can't make the bar jump backwards. Only the `done` and `error`
      // phases are allowed to reset.
      return {
        ...state,
        nfcProgressPhase: action.phase,
        nfcProgressPercent:
          action.phase === 'done' || action.phase === 'error'
            ? action.percent
            : Math.max(state.nfcProgressPercent, action.percent),
        nfcProgressMessage: action.message,
      };
    case 'setChip':
      return { ...state, chip: action.chip, step: 'persist' };
    case 'setError':
      return { ...state, errorMessage: action.message };
  }
}

/**
 * Step → screen ID + title + subtitle (mirrors Swift
 * `currentScreenID/currentTitle/currentSubtitle` on the view model).
 */
export const PASSPORT_STEP_META: Readonly<
  Record<PassportPipelineStep, { readonly id: string; readonly title: string; readonly subtitle: string }>
> = {
  mrz: {
    id: 'PASS-1',
    title: 'passportSetup.step.details.title',
    subtitle: 'passportSetup.step.details.subtitle',
  },
  nfc: {
    id: 'PASS-2',
    title: 'passportSetup.step.read.title',
    subtitle: 'passportSetup.step.read.subtitle',
  },
  persist: {
    id: 'PASS-3',
    title: 'passportSetup.step.save.title',
    subtitle: 'passportSetup.step.save.subtitle',
  },
};

/** Translate a Nitro PassportReadResult into the UI snapshot model. */
export function chipFromNitro(
  result: PassportReadResult,
  fallbackNationality: string,
  fallbackDocNumber: string
): PassportChipSnapshot {
  // Derive the dataGroupsRead label list from which DGs actually came back
  // with bytes — empty slots are downstream consumers' cue that the chip
  // skipped that DG (e.g. older e-passports without DG14/DG15).
  const dg = result.dataGroups;
  const dataGroupsRead: string[] = ['COM', 'SOD'];
  if (hasDataGroupBytes(dg.dg1)) dataGroupsRead.push('DG1');
  if (hasDataGroupBytes(dg.dg2)) dataGroupsRead.push('DG2');
  if (hasDataGroupBytes(dg.dg14)) dataGroupsRead.push('DG14');
  if (hasDataGroupBytes(dg.dg15)) dataGroupsRead.push('DG15');

  // Best-effort DG1 → MRZ string. The DG1 TLV body holds the printable MRZ
  // characters in ASCII; we strip the TLV header by finding the first
  // ASCII run that looks like an MRZ payload. This mirrors the Swift
  // `realNFCRead` parser which reads `passport.passportMRZ` directly from
  // NFCPassportReader — we re-derive it here from raw bytes so the same
  // logic works once Android jmrtd lands without extending the Nitro spec.
  const dg1MRZData = dg.dg1 ? decodeDg1Mrz(dg.dg1) : '';

  return {
    documentHash: '',
    mrzDigest: '',
    mrz: result.mrz,
    dg1MRZData,
    dataGroups: result.dataGroups,
    chipUid: result.chipUid ?? '',
    bacVerified: true,
    paceVerified: true,
    passiveAuthValid: result.passiveAuthValid,
    passiveAuthPassed: result.passiveAuthValid,
    isSimulated: false,
    readAt: new Date(),
    nationalityCode: result.mrz.nationality || fallbackNationality,
    maskedDocNumber: maskDocumentNumber(result.mrz.documentNumber || fallbackDocNumber),
    dataGroupsRead,
  };
}

function hasDataGroupBytes(value: ArrayBuffer | undefined): boolean {
  return value !== undefined && value.byteLength > 0;
}

/**
 * Extract the printable MRZ string from a DG1 TLV blob. DG1 is a single
 * tag-61 ASN.1 TLV wrapping a tag-5F1F MRZ string (88 bytes for TD3
 * passports). We sweep for the longest contiguous run of MRZ-legal chars
 * (A-Z, 0-9, `<`) which is the MRZ — this is robust to small differences
 * in how iOS NFCPassportReader vs Android jmrtd encode the TLV header.
 */
/**
 * TD3 (passport) MRZ is always exactly 2 × 44 = 88 chars. Other ICAO
 * doc types are smaller (TD1 = 90, TD2 = 72), but for passports the
 * 88-char anchor is reliable.
 */
const TD3_MRZ_LEN = 88;

function decodeDg1Mrz(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let best = '';
  let current = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i] ?? 0;
    const isDigit = byte >= 0x30 && byte <= 0x39;
    const isUpper = byte >= 0x41 && byte <= 0x5a;
    const isFiller = byte === 0x3c; // '<'
    if (isDigit || isUpper || isFiller) {
      current += String.fromCharCode(byte);
    } else {
      if (current.length > best.length) best = current;
      current = '';
    }
  }
  if (current.length > best.length) best = current;

  // DG1 TLV layout: outer `61 <len>` then inner `5F 1F <len> <MRZ>`.
  // The length byte just before the 88 MRZ chars is `0x58` (which
  // demangles to ASCII 'X') for TD3 passports — our greedy filter
  // happily includes that 'X' into the longest run, producing an
  // 89-char string that shifts the nationality + DOB byte positions
  // by 1 and makes the legacy disclosure circuit's age computation underflow
  // ("Failed assertion" inside the prover with no field hint).
  //
  // The MRZ always sits at the end of DG1 (no trailing TLVs after
  // `5F 1F`), so taking the last 88 chars of the run is a reliable
  // trim. Anything shorter passes through unchanged for the caller's
  // own length checks downstream.
  if (best.length > TD3_MRZ_LEN) {
    best = best.slice(best.length - TD3_MRZ_LEN);
  }
  return best;
}

/** Stand-in chip snapshot when the Nitro NFC module isn't linked (Sim/Android). */
export function simulatedChipSnapshot(draft: PassportMRZDraft): PassportChipSnapshot {
  const fakeDigest = '0123456789abcdef0123456789abcdef';
  return {
    documentHash: fakeDigest,
    mrzDigest: fakeDigest,
    mrz: {
      nationality: draft.nationalityCode,
      documentNumber: draft.passportNumber,
      name: '',
      dateOfBirth: draft.dateOfBirth,
      dateOfExpiry: draft.expiryDate,
      gender: '',
    },
    dg1MRZData: `P<${draft.nationalityCode}<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<`,
    dataGroups: {},
    chipUid: `SIM-${fakeDigest.slice(0, 8).toUpperCase()}`,
    bacVerified: true,
    paceVerified: false,
    passiveAuthValid: false,
    passiveAuthPassed: false,
    isSimulated: true,
    readAt: new Date(),
    nationalityCode: draft.nationalityCode,
    maskedDocNumber: maskDocumentNumber(draft.passportNumber),
    dataGroupsRead: ['DG1 (sim)'],
  };
}

// ---------------------------------------------------------------------------
// NFC read strategy selector.
//
// Mirrors Swift `PassportPipelineService.shouldSimulateNFC` and the
// `realNFCRead` / `simulatedNFCRead` split. The screen calls this helper
// instead of inlining the branch so we can unit-test that:
//   - Production (developer mode OFF) never silently falls back to the
//     simulated chip — if the Nitro reader is missing or `isAvailable()`
//     returns false, we surface `unavailable` with a typed reason and the
//     UI shows an error instead of a fake green badge.
//   - Developer mode + simulateNfc toggle keeps the synthetic chip flow
//     for simulator testing (CLAUDE.md Rule 8 carve-out).
// ---------------------------------------------------------------------------

export type NfcReadStrategy =
  | { readonly kind: 'real' }
  | { readonly kind: 'simulated'; readonly reason: 'developer-mode' }
  | {
      readonly kind: 'unavailable';
      readonly reason:
        | 'module-missing'
        | 'hardware-unavailable';
      readonly message: string;
    };

export interface SelectNfcReadStrategyInput {
  /** True when the Nitro HybridObject was successfully created. */
  readonly nitroLinked: boolean;
  /** Result of `getNfcPassport().isAvailable()` — only consulted when linked. */
  readonly hardwareAvailable: boolean;
  /** `usePreferences((s) => s.developerMode)`. */
  readonly developerMode: boolean;
  /** `usePreferences((s) => s.simulateNfc)` — the developer-mode toggle. */
  readonly simulateNfc: boolean;
}

/**
 * Decide whether the NFC chip read should use the real Nitro bridge, the
 * developer-mode simulator path, or short-circuit with an `unavailable`
 * error. There is no silent simulator fallback — if `developerMode` is off
 * and the bridge isn't usable, callers must surface the error to the user.
 */
export function selectNfcReadStrategy(
  input: SelectNfcReadStrategyInput
): NfcReadStrategy {
  const devSimulating = input.developerMode && input.simulateNfc;
  if (!input.nitroLinked) {
    if (devSimulating) return { kind: 'simulated', reason: 'developer-mode' };
    return {
      kind: 'unavailable',
      reason: 'module-missing',
      message:
        'NFC passport reader is not available on this build. ' +
        'Rebuild with `bunx expo prebuild --platform ios && pod install` ' +
        'or enable Developer Mode → Simulate NFC to use the offline mock.',
    };
  }
  if (!input.hardwareAvailable) {
    if (devSimulating) return { kind: 'simulated', reason: 'developer-mode' };
    return {
      kind: 'unavailable',
      reason: 'hardware-unavailable',
      message:
        'This device cannot read NFC passports. ' +
        'Use a physical iPhone 7 or newer, or enable Developer Mode → Simulate NFC.',
    };
  }
  if (devSimulating) return { kind: 'simulated', reason: 'developer-mode' };
  return { kind: 'real' };
}

/** What the passport statement discloses, read from the chip's DG1. */
export interface PassportPublicSignals {
  /** True when DG1's date of birth → current age ≥ 18. */
  readonly ageOver18: boolean;
  /** Nationality (ICAO alpha-3). */
  readonly nationality: string;
}

/** Derive the disclosed signals from the DG1 MRZ. No randomness. */
export function derivePassportPublicSignals(args: {
  readonly dg1MRZData: string;
  readonly fallbackNationality: string;
  readonly currentDateYyMmDd: string;
}): PassportPublicSignals {
  const sanitized = sanitizeMRZ(args.dg1MRZData);
  // Without 88 chars of MRZ we can't derive nationality / DOB from DG1.
  // Fall back to the user-entered nationality and assume ageOver18 = false.
  if (sanitized.length < 88) {
    return {
      ageOver18: false,
      nationality: args.fallbackNationality.toUpperCase().slice(0, 3),
    };
  }
  // TD3 line 2 positions 10-12 = nationality, 13-18 = DOB.
  const nationalityRaw = sanitized.slice(54, 57);
  const nationality = nationalityRaw.replace(/</g, '');
  const dob = sanitized.slice(57, 63);
  return {
    ageOver18: isAgeAtLeast18(dob, args.currentDateYyMmDd),
    nationality: nationality || args.fallbackNationality.toUpperCase().slice(0, 3),
  };
}

function sanitizeMRZ(raw: string): string {
  const upper = raw.toUpperCase();
  let out = '';
  for (const ch of upper) {
    const code = ch.charCodeAt(0);
    const isAlphaNum =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90);
    if (isAlphaNum || ch === '<') out += ch;
  }
  return out;
}

function isAgeAtLeast18(dobYyMmDd: string, currentYyMmDd: string): boolean {
  if (dobYyMmDd.length !== 6 || currentYyMmDd.length !== 6) return false;
  const birthYear = Number(dobYyMmDd.slice(0, 2));
  const birthMonth = Number(dobYyMmDd.slice(2, 4));
  const birthDay = Number(dobYyMmDd.slice(4, 6));
  const currentYear = Number(currentYyMmDd.slice(0, 2));
  const currentMonth = Number(currentYyMmDd.slice(2, 4));
  const currentDay = Number(currentYyMmDd.slice(4, 6));
  if (
    Number.isNaN(birthYear) ||
    Number.isNaN(birthMonth) ||
    Number.isNaN(birthDay) ||
    Number.isNaN(currentYear) ||
    Number.isNaN(currentMonth) ||
    Number.isNaN(currentDay)
  ) {
    return false;
  }
  let age = currentYear >= birthYear ? currentYear - birthYear : 100 + currentYear - birthYear;
  const birthdayPassed =
    currentMonth > birthMonth ||
    (currentMonth === birthMonth && currentDay >= birthDay);
  if (!birthdayPassed && age > 0) age -= 1;
  return age >= 18;
}
