import type { PassportReadResult } from '@solidarity/nitro-attest';

import type { PassportChipSnapshot } from '@/passport/pipeline';

export type PassportErrorPhase = 'nfc-read' | 'persist';

type PassportDiagnosticsChip =
  | Partial<
      Pick<
        PassportChipSnapshot,
        'dataGroups' | 'dataGroupsRead' | 'isSimulated' | 'passiveAuthPassed'
      >
    >
  | Partial<
      Pick<
        PassportReadResult,
        'dataGroups' | 'passiveAuthValid'
      >
    >;

export interface BuildPassportErrorDetailInput {
  readonly phase: PassportErrorPhase;
  readonly error: unknown;
  readonly chip?: PassportDiagnosticsChip | null;
}

export function buildPassportErrorDetail(
  input: BuildPassportErrorDetailInput
): string {
  const chip = input.chip ?? null;
  const lines = [
    `Phase: ${input.phase}`,
    `Error code: ${classifyPhaseError(input.phase)}`,
    '',
    'Passport NFC diagnostics:',
    `Data groups read: ${formatDataGroupsRead(chip)}`,
    `SOD: ${formatDataGroup(chip?.dataGroups?.sod)}`,
    `DG1: ${formatDataGroup(chip?.dataGroups?.dg1)}`,
    `DG2: ${formatDataGroup(chip?.dataGroups?.dg2)}`,
    `DG14: ${formatDataGroup(chip?.dataGroups?.dg14)}`,
    `DG15: ${formatDataGroup(chip?.dataGroups?.dg15)}`,
    `Passive authentication: ${formatPassiveAuth(chip)}`,
    `Simulated chip: ${formatBoolean(readBoolean(chip, 'isSimulated'))}`,
    '',
    `Likely cause: ${likelyCause(input.phase)}`,
    '',
    'Raw error:',
    errorDetail(input.error) || '(none)',
  ];
  return lines.join('\n');
}

function classifyPhaseError(phase: PassportErrorPhase): string {
  return phase === 'nfc-read' ? 'PASSPORT_NFC_READ_FAILED' : 'PASSPORT_SAVE_FAILED';
}

function likelyCause(phase: PassportErrorPhase): string {
  return phase === 'nfc-read'
    ? 'The passport NFC session failed before a complete chip snapshot was available.'
    : 'The passport was read, but saving it to local identity storage failed.';
}

function formatDataGroupsRead(chip: PassportDiagnosticsChip | null): string {
  const labels = readDataGroupsRead(chip);
  if (labels.length > 0) return labels.join(', ');

  const inferred = [
    hasBytes(chip?.dataGroups?.sod) ? 'SOD' : null,
    hasBytes(chip?.dataGroups?.dg1) ? 'DG1' : null,
    hasBytes(chip?.dataGroups?.dg2) ? 'DG2' : null,
    hasBytes(chip?.dataGroups?.dg14) ? 'DG14' : null,
    hasBytes(chip?.dataGroups?.dg15) ? 'DG15' : null,
  ].filter((label): label is string => label !== null);
  return inferred.length > 0 ? inferred.join(', ') : 'unknown';
}

function readDataGroupsRead(chip: PassportDiagnosticsChip | null): readonly string[] {
  if (chip == null || !('dataGroupsRead' in chip)) return [];
  const raw = chip.dataGroupsRead;
  return Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string')
    : [];
}

function formatDataGroup(value: ArrayBuffer | undefined): string {
  if (!hasBytes(value)) return 'missing';
  return `present (${value.byteLength} bytes)`;
}

function hasBytes(value: ArrayBuffer | undefined): value is ArrayBuffer {
  return value !== undefined && value.byteLength > 0;
}

function formatPassiveAuth(chip: PassportDiagnosticsChip | null): string {
  const snapshotValue = readBoolean(chip, 'passiveAuthPassed');
  if (snapshotValue !== undefined) return snapshotValue ? 'passed' : 'failed';
  const readResultValue = readBoolean(chip, 'passiveAuthValid');
  if (readResultValue !== undefined) return readResultValue ? 'passed' : 'failed';
  return 'unknown';
}

function readBoolean(
  value: PassportDiagnosticsChip | null,
  key: 'isSimulated' | 'passiveAuthPassed' | 'passiveAuthValid'
): boolean | undefined {
  if (value == null || !(key in value)) return undefined;
  const raw = value[key as keyof PassportDiagnosticsChip];
  return typeof raw === 'boolean' ? raw : undefined;
}

function formatBoolean(value: boolean | undefined): string {
  if (value === undefined) return 'unknown';
  return value ? 'yes' : 'no';
}

function errorMessage(error: unknown): string {
  if (error == null) return '';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'number' || typeof error === 'boolean') return String(error);
  if (typeof error === 'bigint') return error.toString();
  if (typeof error === 'symbol') return error.description ?? 'symbol';
  try {
    const json = JSON.stringify(error);
    return typeof json === 'string' ? json : '[unserialisable error value]';
  } catch {
    return '[unserialisable error value]';
  }
}

function errorDetail(error: unknown): string {
  if (error == null) return '';
  if (error instanceof Error) {
    const stack = error.stack ? `\n${error.stack}` : '';
    return `${error.name}: ${error.message}${stack}`;
  }
  return errorMessage(error);
}
