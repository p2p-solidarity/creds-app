import { describe, expect, it } from 'bun:test';

import {
  isDeveloperOnlyDeepLinkKind,
  isDeveloperOnlyScanPayload,
} from '../../src/scan/technicalFlowGate';

describe('technical scan-flow gate', () => {
  it('recognises only OIDC payloads as developer-only scanner input', () => {
    for (const payload of [
      'openid4vp://authorize?client_id=https%3A%2F%2Fverifier.example&state=abc',
      'openid-vp://verify?vp_token=token&presentation_submission=submission',
      'openid-credential-offer://?credential_offer=%7B%7D',
    ]) {
      expect(isDeveloperOnlyScanPayload(payload)).toBe(true);
    }

    for (const payload of [
      'https://creds.id/alice#signed-page-fragment',
      'solidarity://card/f47ac10b-58cc-4372-a567-0e02b2c3d479',
      'BEGIN:VCARD\nVERSION:4.0\nFN:Ari\nEND:VCARD',
    ]) {
      expect(isDeveloperOnlyScanPayload(payload)).toBe(false);
    }
  });

  it('never hides a webSign request — the Page flow owns it for every user (07-plan P3)', () => {
    for (const payload of [
      'solidarity://websign?req=header.payload.signature',
      'https://creds.id/websign#req=header.payload.signature',
      'https://solidarity.gg/websign#req=header.payload.signature',
      'https://example.com/websign#req=header.payload.signature',
      'https://example.com/websign',
      'https://example.com/websign#signed-page-fragment',
      'https://example.com/websign#req=',
    ]) {
      expect(isDeveloperOnlyScanPayload(payload)).toBe(false);
    }
  });

  it('keeps only technical app deep-link kinds behind Developer Options', () => {
    expect(isDeveloperOnlyDeepLinkKind('oidc')).toBe(true);
    expect(isDeveloperOnlyDeepLinkKind('credentialOffer')).toBe(true);
    expect(isDeveloperOnlyDeepLinkKind('webSign')).toBe(false);
    expect(isDeveloperOnlyDeepLinkKind('verifiedProfile')).toBe(false);
    expect(isDeveloperOnlyDeepLinkKind('card')).toBe(false);
  });
});
