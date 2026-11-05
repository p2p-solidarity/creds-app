/**
 * PassportMrzStep — extracted from app/passport/index.tsx so the page-level
 * orchestrator stays under the lint budget.
 *
 * Toggles between a
 * "Scan Passport / Manual Input" entry card and the manual-input field
 * stack pre-filled by the MRZ camera modal.
 *
 * Date entry: user types YYYY/MM/DD (auto-formatted). Stored on the draft
 * as the MRZ-native YYMMDD because the BAC/PACE key derivation hashes that
 * 6-char string verbatim; only the displayed century comes from
 * passport/pipeline.mrzDate (expiry and birth use different rules).
 */
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedButton } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { useTranslation } from '@/i18n';
import { mrzDate, type MrzDateKind, type PassportMRZDraft } from '@/passport/pipeline';

/** Convert raw digit input → display `YYYY/MM/DD` (truncates >8 digits). */
function formatYyyyMmDd(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}/${d.slice(4)}`;
  return `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6)}`;
}

/** Display `YYYY/MM/DD` → MRZ-native YYMMDD (last 6 digits). */
function toMrzYyMmDd(display: string): string {
  const digits = display.replace(/\D/g, '');
  if (digits.length !== 8) return digits.slice(-6); // partial; validator will catch
  return digits.slice(2);
}

/** MRZ YYMMDD → display `YYYY/MM/DD`. */
function fromMrzYyMmDd(mrz: string, kind: MrzDateKind): string {
  if (!/^\d{6}$/.test(mrz)) return '';
  const year = mrzDate(mrz, kind)?.getUTCFullYear() ?? 2000 + Number(mrz.slice(0, 2));
  return `${String(year)}/${mrz.slice(2, 4)}/${mrz.slice(4, 6)}`;
}

export function PassportMrzStep({
  showManualInput,
  setShowManualInput,
  draft,
  developerMode,
  patch,
  onContinue,
  canScan,
  onScanPressed,
}: {
  readonly showManualInput: boolean;
  readonly setShowManualInput: (v: boolean) => void;
  readonly draft: PassportMRZDraft;
  readonly developerMode: boolean;
  readonly patch: (p: Partial<PassportMRZDraft>) => void;
  readonly onContinue: () => void;
  /** MRZ text recognition exists in this build (not in F-Droid). */
  readonly canScan: boolean;
  readonly onScanPressed: () => void;
}) {
  const { t } = useTranslation();
  if (!showManualInput) {
    return (
      <View className="gap-6">
        {/* Centred icon → focused copy, matching the ProofStep header so every
            passport-setup screen shares the same calm, centred intro. */}
        <View className="items-center gap-4 pt-2">
          <View style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
            <SfIcon name="doc.viewfinder" size={48} color={Colors.primaryBlue} />
          </View>
          <View className="items-center gap-2">
            <Text className="text-text1 text-center text-[16px] font-medium">
              {t('passportSetup.details.scanTitle')}
            </Text>
            <Text className="text-text2 px-8 text-center text-[14px]" style={{ lineHeight: 22 }}>
              {developerMode
                ? 'Position the photo page in the frame to read the MRZ — or enter the details by hand.'
                : t('passportSetup.details.scanHint')}
            </Text>
          </View>
        </View>

        <View className="bg-mutedSurface gap-3 rounded-group p-3.5">
          <ThemedButton
            label={t('passportSetup.details.scan')}
            fullWidth
            leadingIcon={
              <SfIcon
                name="camera.viewfinder"
                size={15}
                weight="semibold"
                color={Colors.invertedButtonText}
              />
            }
            onPress={onScanPressed}
          />
          <PressableScale
            haptic="tap"
            onPress={() => { setShowManualInput(true); }}
            accessibilityRole="button"
            className="rounded-button"
            style={{
              paddingVertical: 12,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: Colors.text1,
            }}
          >
            <Text className="text-text1 text-[15px]">
              {t('passportSetup.details.manual')}
            </Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  return (
    <View className="bg-mutedSurface gap-2.5 rounded-group p-3.5">
      {/* F-Droid ships without ML Kit: say so instead of silently dropping the scan. */}
      {canScan ? null : (
        <Text className="text-text2 text-[13px]" style={{ lineHeight: 19 }}>
          {t('passportSetup.details.noScanInBuild')}
        </Text>
      )}
      <Field
        label={t('passportSetup.details.passportNumber')}
        value={draft.passportNumber}
        onChangeText={(v) => { patch({ passportNumber: v.toUpperCase() }); }}
        autoCapitalize="characters"
      />
      <Field
        label={t('passportSetup.details.nationality')}
        value={draft.nationalityCode}
        onChangeText={(v) => { patch({ nationalityCode: v.toUpperCase() }); }}
        autoCapitalize="characters"
        maxLength={3}
      />
      <DateField
        label={t('passportSetup.details.birthDate')}
        mrz={draft.dateOfBirth}
        kind="birth"
        onChange={(mrz) => { patch({ dateOfBirth: mrz }); }}
        placeholder="1990/01/15"
      />
      <DateField
        label={t('passportSetup.details.expiryDate')}
        mrz={draft.expiryDate}
        kind="expiry"
        onChange={(mrz) => { patch({ expiryDate: mrz }); }}
        placeholder="2030/12/31"
      />
      <View className="pt-2">
        <ThemedButton
          label={developerMode ? 'Continue to NFC' : t('passportSetup.details.continue')}
          fullWidth
          onPress={onContinue}
        />
      </View>
      {canScan ? (
        <PressableScale
          haptic="tap"
          onPress={() => { setShowManualInput(false); }}
          accessibilityRole="button"
          containerStyle={{ alignSelf: 'center' }}
        >
          <Text className="text-text2 text-[12px]">{t('passportSetup.details.backToScan')}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

/**
 * A YYYY/MM/DD field over an MRZ YYMMDD value. The typed text lives here: the
 * draft only holds the last 6 digits, which can't be shown back mid-typing.
 * A value set from outside (camera scan) replaces the text.
 */
function DateField({
  label,
  mrz,
  kind,
  onChange,
  placeholder,
}: {
  readonly label: string;
  readonly mrz: string;
  readonly kind: MrzDateKind;
  readonly onChange: (mrz: string) => void;
  readonly placeholder: string;
}) {
  const [text, setText] = useState(() => fromMrzYyMmDd(mrz, kind));
  const [shownMrz, setShownMrz] = useState(mrz);
  if (mrz !== shownMrz) {
    setShownMrz(mrz);
    if (toMrzYyMmDd(text) !== mrz) setText(fromMrzYyMmDd(mrz, kind));
  }
  return (
    <Field
      label={label}
      value={text}
      onChangeText={(v) => {
        const display = formatYyyyMmDd(v);
        setText(display);
        onChange(toMrzYyMmDd(display));
      }}
      placeholder={placeholder}
      keyboardType="number-pad"
      maxLength={10}
    />
  );
}

function Field({
  label,
  ...inputProps
}: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (v: string) => void;
  readonly autoCapitalize?: 'none' | 'characters';
  readonly keyboardType?: 'default' | 'number-pad';
  readonly maxLength?: number;
  readonly placeholder?: string;
}) {
  return (
    <View className="gap-1">
      <Text className="text-text2 text-[12px]">{label}</Text>
      <TextInput
        autoCorrect={false}
        placeholderTextColor={Colors.text3}
        className="text-text1 rounded-field bg-cardBg text-[15px]"
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderWidth: 0.5,
          borderColor: Colors.divider,
        }}
        {...inputProps}
      />
    </View>
  );
}
