import { uuid, type BusinessCard } from '@solidarity/shared';

import {
  buildSnapshot,
  formatSwiftIso8601,
  resolveSelectedFields,
  stableStringify,
  type QRCodeEnvelopePayload,
  type SolidarityQrPayloadOptions,
} from '@/cards/solidarityQrTypes';

export {
  enabledFieldsFromSharePreferences,
  formatSwiftIso8601,
  stableStringify,
  type QRCodeEnvelopePayload,
  type QRDidSignedPayload,
  type QRPlaintextPayload,
  type QRSharingPayload,
  type SelectiveDisclosureProof,
  type ShareFieldPreferences,
  type SharingFormat,
  type SolidarityQrPayloadOptions,
  type SolidarityQrSigner,
} from '@/cards/solidarityQrTypes';
export { buildDidSignedEnvelope } from '@/cards/didSignedCredentialPayload';

export function buildSolidarityQrPayload(
  card: BusinessCard,
  options: SolidarityQrPayloadOptions = {}
): string {
  const sharingLevel = options.sharingLevel ?? 'professional';
  const shareId = options.shareId ?? uuid();
  const selectedFields = resolveSelectedFields(card, sharingLevel, options);
  const envelope: QRCodeEnvelopePayload = {
    version: 2,
    format: 'plaintext',
    sharingLevel,
    selectedFields,
    shareId,
    plaintext: {
      snapshot: buildSnapshot(card, selectedFields, options.sealedRoute),
      shareId,
      createdAt: formatSwiftIso8601(options.now ?? new Date()),
      expirationDate: options.expirationDate
        ? formatSwiftIso8601(options.expirationDate)
        : undefined,
      proofClaims: normalizeProofClaims(options.proofClaims),
      selectedFields,
    },
  };
  return stableStringify(envelope);
}

function normalizeProofClaims(
  claims: readonly string[] | undefined
): readonly string[] | undefined {
  if (claims === undefined) return undefined;
  const selected = new Set(claims);
  const out: string[] = [];
  if (selected.has('is_human')) out.push('is_human');
  if (selected.has('age_over_18')) out.push('age_over_18');
  return out.length > 0 ? out : undefined;
}
