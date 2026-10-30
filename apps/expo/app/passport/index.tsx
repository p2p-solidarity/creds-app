/**
 * Passport Setup — 1:1 port of Swift PassportOnboardingFlowView.swift +
 * PassportOnboardingFlowView+Steps.swift.
 *
 * Multi-step orchestration (state machine in @/passport/pipeline):
 *   mrz   → Scan Passport / Manual Input toggle. Tap Scan → MRZCameraStep
 *           modal (vision-camera) lays an overlay on the live feed; once a
 *           draft is detected the user confirms with "Use This" and we drop
 *           into the manual-input panel pre-filled with the scanned fields.
 *   nfc   → iPhone + waveform visual, "Read NFC Chip" button. Passive
 *           authentication runs natively during the read.
 *   persist → "Save passport": saves the credential and, for a real chip
 *           that passed passive auth, signs the device-attested passport
 *           statement (docs/ref/11 §6.1). No circuit runs (docs/ref/11 P2).
 *
 * The NFC read path is chosen by `selectNfcReadStrategy`:
 *   - `real`        — production build with the Nitro bridge linked and
 *                     Core NFC available (physical iPhone). No fallback.
 *   - `simulated`   — developer-mode-only mock. Requires BOTH
 *                     `developerMode` AND `simulateNfc` flags so a
 *                     toggle-flick alone never substitutes a fake chip.
 *   - `unavailable` — typed error surfaced to the toast bar (Simulator
 *                     without dev mode, or Nitro module unlinked).
 *
 * Trust level (docs/ref/11 P2): L3 = passive auth passed and this phone's
 * attested device key signed the statement; L2 = passive auth passed but no
 * statement (verified on this phone only); L1 = passive auth failed or a
 * developer-mode simulation — never presented as government-grade.
 */
import { useLocalSearchParams } from 'expo-router';
import { safeBack } from '@/navigation/safeBack';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PassportMrzStep } from '@/components/passport/PassportMrzStep';
import { NfcStep, PersistStep } from '@/components/passport/PassportSteps';
import { SolidarityPlaceholderCard } from '@/components/passport/SolidarityPlaceholderCard';
import { appAlert, showError } from '@/feedback/appAlert';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import {
  MRZCameraStep,
  type PassportMRZDraft as MrzScannedDraft,
} from '@/onboarding/steps/MRZCameraStep';
import { notifyPassportOnboardingCompleted } from '@/onboarding/passportHandoff';
import {
  chipFromNitro,
  derivePassportPublicSignals,
  initialPassportPipelineState,
  PASSPORT_STEP_META,
  passportPipelineReducer,
  selectNfcReadStrategy,
  simulatedChipSnapshot,
  validateMrzDraft,
  type PassportChipSnapshot,
  type PassportMRZDraft,
} from '@/passport/pipeline';
import { derivePassportFingerprint, passportFingerprintTag } from '@/passport/persistence';
import { buildPassportProvableClaims } from '@/passport/presentationClaims';
import {
  buildPassportErrorDetail,
  type PassportErrorPhase,
} from '@/passport/diagnostics';
import { didKeyForCurrentIdentity, requireSensitiveAction } from '@/keychain';
import { usePreferences } from '@/settings/preferences';
import { useCredentialStore, type TrustLevel } from '@/credentials/store';
import { removeCredentialAndClaims } from '@/credentials/removeCredential';
import { isRetiredPassportCredential } from '@/credentials/trustDisplay';
import { useActiveDid, useIdentityData } from '@/identity';
import type { PassportReadResult } from '@solidarity/nitro-attest';
import { uuid } from '@solidarity/shared';
import { loadPassportNitroModules } from '@/passport/nitroModules';
import { issuePassportStatement } from '@/passport/npubBinding';
import { confirmDialog } from '@/feedback/confirmDialog';
import { DEFAULT_RELAYS } from '@/nostr/publish';
import { hasNostrKeySync } from '@/nostr/userKey';
import { deviceAttestSupported } from '@/witness/deviceKey';

/**
 * Parse a YYMMDD MRZ date into a JS Date in UTC. Returns null on
 * malformed input so the credential just doesn't get an expiry field
 * rather than ending up with `Invalid Date`. Years 00..69 map to
 * 2000..2069, 70..99 map to 1970..1999 — the ICAO 9303 sliding window.
 */
function parseMrzYyMmDd(yymmdd: string): Date | null {
  if (yymmdd.length !== 6) return null;
  const yy = Number.parseInt(yymmdd.slice(0, 2), 10);
  const mm = Number.parseInt(yymmdd.slice(2, 4), 10);
  const dd = Number.parseInt(yymmdd.slice(4, 6), 10);
  if (Number.isNaN(yy) || Number.isNaN(mm) || Number.isNaN(dd)) return null;
  const year = yy <= 69 ? 2000 + yy : 1900 + yy;
  const d = new Date(Date.UTC(year, mm - 1, dd));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * A saved record of the same passport blocks a second save — unless it was
 * saved by the retired ZK path (docs/ref/11 P2): those are the records the
 * user is asked to rescan, so the rescan replaces them.
 */
async function findSavedPassport(fingerprint: string) {
  await useCredentialStore.getState().hydrate();
  await useIdentityData.getState().hydrate();
  const tag = passportFingerprintTag(fingerprint);
  const records = [
    ...useIdentityData.getState().identityCards,
    ...useCredentialStore.getState().details.values(),
  ].filter((r) => r.type === 'passport' && r.metadataTags.includes(tag));
  return {
    duplicate: records.find((r) => !isRetiredPassportCredential(r)) ?? null,
    retiredIds: [...new Set(records.filter((r) => isRetiredPassportCredential(r)).map((r) => r.id))],
  };
}

export default function PassportSetup() {
  const params = useLocalSearchParams<{ manual?: string; from?: string }>();
  const fromOnboarding = params.from === 'onboarding';
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const activeDid = useActiveDid();
  const [state, dispatch] = useReducer(passportPipelineReducer, initialPassportPipelineState);
  const [showManualInput, setShowManualInput] = useState(params.manual === '1');
  const [showCamera, setShowCamera] = useState(false);

  const meta = PASSPORT_STEP_META[state.step];
  const nitro = useMemo(() => loadPassportNitroModules(), []);
  const developerMode = usePreferences((s) => s.developerMode);
  const simulateNfc = usePreferences((s) => s.simulateNfc);
  // Mirrors Swift `PassportPipelineService.shouldSimulateNFC` — pick `real`,
  // `simulated` (developer-mode only), or `unavailable` (production w/o a
  // working bridge). No silent mock substitution — `unavailable` surfaces a
  // typed message to the toast bar instead of returning fake chip data.
  const nfcStrategy = useMemo(
    () =>
      selectNfcReadStrategy({
        nitroLinked: nitro.nfc !== null,
        hardwareAvailable: nitro.nfc?.isAvailable() ?? false,
        developerMode,
        simulateNfc,
      }),
    [nitro.nfc, developerMode, simulateNfc]
  );
  useEffect(() => {
    if (state.errorMessage) {
      pushToast(state.errorMessage, 'error');
      dispatch({ type: 'setError', message: null });
    }
  }, [state.errorMessage]);

  const onValidateMrz = () => {
    const err = validateMrzDraft(state.draft);
    if (err) {
      dispatch({
        type: 'setError',
        message: developerMode ? err.message : t('passportSetup.error.details'),
      });
      return;
    }
    dispatch({ type: 'gotoStep', step: 'nfc' });
  };

  const onReadNfc = async () => {
    if (nfcStrategy.kind === 'unavailable') {
      reportPassportError({
        developerMode,
        title: t('passportSetup.error.title'),
        context: 'Passport › NFC Read',
        phase: 'nfc-read',
        summary: developerMode ? nfcStrategy.message : t('passportSetup.error.nfcUnavailable'),
        error: nfcStrategy.message,
      });
      return;
    }
    dispatch({ type: 'setLoading', value: true });
    dispatch({
      type: 'setNfcProgressEvent',
      phase: nfcStrategy.kind === 'simulated' ? 'connecting' : 'connecting',
      percent: 0,
      message:
        nfcStrategy.kind === 'simulated'
          ? 'Simulating chip read (developer mode)...'
          : 'Hold passport near device...',
    });
    let diagnosticResult: PassportReadResult | null = null;
    try {
      let chip: PassportChipSnapshot;
      if (nfcStrategy.kind === 'simulated') {
        chip = await simulateNfcRead(state.draft);
      } else {
        // Production path — talk to the real chip via Nitro. No fallback:
        // any error (cancellation, tag-lost, BAC/PACE failure) bubbles up
        // unchanged so the user sees the underlying NFCPassportReader
        // failure, not a faked green-checkmark snapshot.
        const nfcReader = nitro.nfc;
        if (nfcReader === null) {
          throw new Error(
            'NFC passport reader is not linked. Rebuild with `pod install`.'
          );
        }
        const result = await nfcReader.read(
          {
            documentNumber: state.draft.passportNumber,
            dateOfBirth: state.draft.dateOfBirth,
            dateOfExpiry: state.draft.expiryDate,
          },
          {
            // The JS pipeline only consumes DG1 today — dropping DG2 (the
            // ~15-30KB face JPEG) halves typical read time (~5-8s → ~2-3s).
            // Flip back to false when face matching ships.
            skipFaceImage: true,
            onProgress: (event) => {
              dispatch({
                type: 'setNfcProgressEvent',
                phase: event.phase,
                percent: event.percent,
                message: event.message ?? '',
              });
            },
          },
        );
        diagnosticResult = result;
        chip = chipFromNitro(
          result,
          state.draft.nationalityCode,
          state.draft.passportNumber
        );
      }
      dispatch({
        type: 'setNfcProgressEvent',
        phase: 'done',
        percent: 100,
        message: 'Read complete.',
      });
      dispatch({ type: 'setChip', chip });
    } catch (err) {
      dispatch({
        type: 'setNfcProgressEvent',
        phase: 'error',
        percent: 0,
        message: 'Passport NFC read failed.',
      });
      reportPassportError({
        developerMode,
        title: t('passportSetup.error.title'),
        context: 'Passport › NFC Read',
        phase: 'nfc-read',
        summary: developerMode
          ? 'Could not read the passport NFC chip.'
          : t('passportSetup.error.nfcRead'),
        error: err,
        chip: diagnosticResult,
      });
    } finally {
      dispatch({ type: 'setLoading', value: false });
    }
  };

  // `isLoading` only turns on after the Face ID gate, so a second tap on Save
  // (or one inside the biometric grace window, where the gate returns at
  // once) ran a second save that also found no saved passport — two
  // credentials, two statements, 4 + 4 claims. This ref closes that window
  // synchronously.
  const persisting = useRef(false);
  const onPersist = async () => {
    if (persisting.current) return;
    persisting.current = true;
    try {
      await persist();
    } finally {
      persisting.current = false;
    }
  };

  const persist = async () => {
    if (!state.draft || !state.chip) {
      pushToast(
        developerMode ? 'Passport flow not complete' : t('passportSetup.error.details'),
        'warning'
      );
      return;
    }
    // CLAUDE.md Sec rule: Face ID is required for passport save.
    const gate = await requireSensitiveAction(
      'issueCredential',
      t('security.prompt.issueCredential')
    );
    if (!gate.success) {
      pushToast(
        developerMode
          ? 'Face ID is required to save your passport credential.'
          : t('passportSetup.error.faceId'),
        'warning'
      );
      return;
    }
    dispatch({ type: 'setLoading', value: true });
    try {
      const draft = state.draft;
      const chip = state.chip;
      const passportFingerprint = derivePassportFingerprint(draft);
      const saved = await findSavedPassport(passportFingerprint);
      if (saved.duplicate) {
        pushToast(
          developerMode
            ? 'This passport credential is already saved. Delete the existing passport before scanning it again.'
            : t('passportSetup.error.alreadySaved'),
          'warning'
        );
        return;
      }
      for (const id of saved.retiredIds) await removeCredentialAndClaims(id);
      const cardId = uuid();
      const now = new Date();
      const issuerType = chip.isSimulated ? 'selfIssued' : 'government';
      const issuerDid = chip.isSimulated
        ? `did:self:passport:${cardId}`
        : `did:gov:passport:${draft.nationalityCode}`;
      // FAIL CLOSED on the holder binding: if the master signing key has not
      // resolved yet (e.g. iCloud Keychain not synced), NEVER fabricate a
      // `did:key:${cardId}` placeholder — it would look valid but bind to no
      // key. Resolve the real signing-key DID and abort if it is unavailable.
      let holderDid = activeDid;
      if (holderDid == null || holderDid.length === 0) {
        try {
          holderDid = await didKeyForCurrentIdentity();
        } catch {
          holderDid = null;
        }
      }
      if (holderDid == null || holderDid.length === 0) {
        pushToast(
          developerMode
            ? 'Identity key not ready — wait for iCloud Keychain sync, then retry.'
            : t('passportSetup.error.identityUnavailable'),
          'error'
        );
        return;
      }
      const expiry = parseMrzYyMmDd(draft.expiryDate);
      const chipVerified = !chip.isSimulated && chip.passiveAuthValid;

      // Device-attested passport statement (docs/ref/11 §6.1): only for a real
      // chip that passed passive auth, on a phone that can attest its key.
      // Whether it was signed decides L3 vs L2, so it is awaited here.
      let statementSigned = false;
      const sod = chip.dataGroups?.sod;
      if (chipVerified && sod !== undefined && sod.byteLength > 0 && hasNostrKeySync() && deviceAttestSupported()) {
        const countAsWitness = await confirmDialog({
          title: t('passportStatement.optInTitle'),
          message: t('passportStatement.optInBody'),
          confirmLabel: t('passportStatement.optInConfirm'),
          cancelLabel: t('passportStatement.optInDecline'),
        });
        const { ageOver18 } = derivePassportPublicSignals({
          dg1MRZData: chip.dg1MRZData,
          fallbackNationality: draft.nationalityCode,
          currentDateYyMmDd: now.toISOString().slice(2, 10).replaceAll('-', ''),
        });
        const statement = await issuePassportStatement(
          { sod, ageOver18, readAt: chip.readAt, passportExpiresAt: expiry, countAsWitness, credentialId: cardId },
          DEFAULT_RELAYS,
        );
        statementSigned = statement.ok;
        if (!statement.ok) console.warn(`[passport] statement not signed — ${statement.error}`);
      }
      const trustLevel: TrustLevel = !chipVerified ? 'L1' : statementSigned ? 'L3' : 'L2';

      const metadataTags: string[] = [passportFingerprintTag(passportFingerprint)];
      if (chipVerified) metadataTags.push('passport-passive-auth');
      if (statementSigned) metadataTags.push('passport-statement');
      if (chip.isSimulated) metadataTags.push('simulated');
      if (!chipVerified) metadataTags.push('fallback');

      // No proof bytes exist any more; the record only says what was checked.
      const rawJwt = JSON.stringify({
        passiveAuth: chipVerified,
        statement: statementSigned,
        readAt: chip.readAt.toISOString(),
      });

      await useCredentialStore.getState().add({
        id: cardId,
        type: 'passport',
        title: chip.isSimulated ? 'Passport (dev-mode)' : 'Passport',
        issuerDid,
        holderDid,
        trustLevel,
        rawJwt,
        issuedAt: now,
        ...(expiry ? { expiresAt: expiry } : {}),
        metadataTags,
      });

      await useIdentityData.getState().upsertIdentityCard({
        id: cardId,
        type: 'passport',
        issuerType,
        trustLevel,
        title: chip.isSimulated ? 'Passport (dev-mode)' : 'Passport',
        issuerDid,
        holderDid,
        issuedAt: now,
        ...(expiry ? { expiresAt: expiry } : {}),
        status: chip.isSimulated ? 'simulated' : chipVerified ? 'verified' : 'fallback',
        sourceReference: chip.isSimulated ? 'MRZ+NFC(simulated)' : 'MRZ+NFC',
        rawCredentialJWT: rawJwt,
        metadataTags,
        createdAt: now,
        updatedAt: now,
      });

      const claims = buildPassportProvableClaims({
        cardId,
        proofType: statementSigned ? 'passport-statement' : chipVerified ? 'passport-passive-auth' : 'unverified',
        issuerType,
        trustLevel,
        nationalityCode: draft.nationalityCode,
        isSimulated: chip.isSimulated,
        now,
        uuid,
      });
      for (const c of claims) {
        await useIdentityData.getState().upsertProvableClaim(c);
      }

      pushToast(
        developerMode && chip.isSimulated
          ? 'Mock passport credential issued (demo only)'
          : !chipVerified
            ? t('passportSetup.savedUnverified')
            : statementSigned
              ? t('passportSetup.saved')
              : t('passportSetup.savedLocalOnly'),
        chipVerified ? 'success' : 'warning',
      );
      // When this flow was launched from onboarding, signal completion so the
      // wizard advances to the `complete` step before router.back() reveals it.
      if (fromOnboarding) notifyPassportOnboardingCompleted();
      safeBack();
    } catch (err) {
      const technicalSummary = (err instanceof Error ? err.message : String(err)).split('\n')[0];
      reportPassportError({
        developerMode,
        title: t('passportSetup.error.title'),
        context: 'Passport › Save Credential',
        phase: 'persist',
        summary: developerMode
          ? technicalSummary ?? 'Failed to save passport credential'
          : t('passportSetup.error.save'),
        error: err,
        chip: state.chip,
      });
    } finally {
      dispatch({ type: 'setLoading', value: false });
    }
  };

  return (
    <View className="bg-pageBg flex-1" style={{ paddingTop: insets.top }}>
      <NavBar onClose={() => { safeBack(); }} />
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={16}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
        <SolidarityPlaceholderCard
          screenID={meta.id}
          title={t(meta.title)}
          subtitle={t(meta.subtitle)}
        />

        <View className="h-4" />

        {state.step === 'mrz' ? (
          <PassportMrzStep
            showManualInput={showManualInput}
            setShowManualInput={setShowManualInput}
            draft={state.draft}
            developerMode={developerMode}
            patch={(patch) => { dispatch({ type: 'patchDraft', patch }); }}
            onContinue={onValidateMrz}
            onScanPressed={() => { setShowCamera(true); }}
          />
        ) : null}

        {state.step === 'nfc' ? (
          <NfcStep
            busy={state.isLoading}
            progress={state.nfcProgressMessage}
            progressPercent={state.nfcProgressPercent}
            progressPhase={state.nfcProgressPhase}
            chip={state.chip}
            developerMode={developerMode}
            onRead={() => { void onReadNfc(); }}
          />
        ) : null}

        {state.step === 'persist' ? (
          <PersistStep
            chip={state.chip}
            busy={state.isLoading}
            developerMode={developerMode}
            onSave={() => { void onPersist(); }}
          />
        ) : null}
      </KeyboardAwareScrollView>

      <Modal
        visible={showCamera}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => { setShowCamera(false); }}
      >
        <MRZCameraStep
          developerMode={developerMode}
          onScanned={(scanned) => {
            applyScannedDraft(scanned, dispatch);
            setShowCamera(false);
            setShowManualInput(true);
          }}
          onCancel={() => { setShowCamera(false); }}
          onSwitchToManual={() => {
            setShowCamera(false);
            setShowManualInput(true);
          }}
        />
      </Modal>
    </View>
  );
}

async function simulateNfcRead(draft: PassportMRZDraft): Promise<PassportChipSnapshot> {
  await new Promise<void>((r) => setTimeout(r, 800));
  return simulatedChipSnapshot(draft);
}

function reportPassportError(args: {
  readonly developerMode: boolean;
  readonly title: string;
  readonly context: string;
  readonly phase: PassportErrorPhase;
  readonly summary: string;
  readonly error: unknown;
  readonly chip?: PassportReadResult | PassportChipSnapshot | null;
}): void {
  if (!args.developerMode) {
    appAlert({ title: args.title, message: args.summary });
    return;
  }

  showError({
    context: args.context,
    summary: args.summary,
    error: buildPassportErrorDetail({
      phase: args.phase,
      error: args.error,
      chip: args.chip,
    }),
  });
}

function applyScannedDraft(
  scanned: MrzScannedDraft,
  dispatch: (action: { type: 'patchDraft'; patch: Partial<PassportMRZDraft> }) => void
) {
  dispatch({
    type: 'patchDraft',
    patch: {
      passportNumber: scanned.passportNumber,
      nationalityCode: scanned.nationalityCode,
      dateOfBirth: scanned.dateOfBirth,
      expiryDate: scanned.expiryDate,
    },
  });
}

function NavBar({ onClose }: { onClose: () => void }) {
  return (
    <View className="flex-row items-center justify-between px-4" style={{ height: 44 }}>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        style={{ width: 60, height: 44, justifyContent: 'center' }}
      >
        <Text className="text-text1 text-[15px]">Close</Text>
      </Pressable>
      <Text className="text-text1 text-[17px] font-semibold">Passport Setup</Text>
      <View style={{ width: 60 }} />
    </View>
  );
}
