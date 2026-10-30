/**
 * ThemedTextInput — the single text-input primitive, completing the
 * Themed{Button,Text,Surface} family (apps/expo/CLAUDE.md rules 1–5).
 *
 * Before this, every screen hand-rolled a raw <TextInput> with inline
 * styles that drifted (14 vs 15px, border-or-not, no focus state, sub-44pt
 * touch targets). Route inputs through this instead — every future
 * platform-binding wizard (S/A/B/C, docs/ref/03 §5) gets a correct field
 * for free instead of re-hand-rolling and re-drifting.
 *
 * Bakes in the mobile text-input UX baseline the raw fields were missing:
 *  - visible FOCUS state (accent/mauve border) and ERROR state (destructive
 *    border + message row) — the two states a bare TextInput never showed;
 *  - `kind` sets the right keyboard / autocapitalize / secure defaults in
 *    ONE place (`text | url | handle | secret | did`);
 *  - ≥44pt touch target (rule 6);
 *  - trailing affordances: reveal (auto for `secret`), paste, clear;
 *  - every colour from a `Colors` token (rule 4) — no new hex.
 *
 * Shape = creds.id's form row (`.land-row`, airmeishi-web global.css): one
 * bordered 48pt row at `--radius-field`, an optional icon well flush left
 * behind a divider (`icon` / `leading`), an inline mono prefix
 * (`creds.id/@`, `t.me/`) and the primary border of `.field-input:focus-visible`.
 * Technical text — URLs, handles, keys — is monospace, value and
 * placeholder alike, as on the web.
 *
 * Controlled field (`value`/`onChangeText`); focus + reveal are local UI
 * state (rule 9). Label is optional — omit it where the row already has its
 * own heading (e.g. the link-label input inside a bordered card).
 */
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import {
  Pressable,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
  type TextInputInstance,
  type TextInputProps as RNTextInputProps,
} from 'react-native';
import type { SFSymbol } from 'expo-symbols';

import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { Colors } from '@/constants/Colors';
import { useThemeColors } from '@/constants/useThemeColors';
import { MONO, textFont } from '@/constants/fonts';
import { useTranslation } from '@/i18n';

import { ThemedText } from './ThemedText';
import { Radius } from '@/constants/radius';

export type TextInputKind = 'text' | 'url' | 'handle' | 'secret' | 'did';

interface KindConfig {
  readonly keyboardType?: KeyboardTypeOptions;
  readonly autoCapitalize?: RNTextInputProps['autoCapitalize'];
  readonly autoCorrect?: boolean;
  readonly autoComplete?: RNTextInputProps['autoComplete'];
  readonly textContentType?: RNTextInputProps['textContentType'];
  readonly mono?: boolean;
  readonly secret?: boolean;
}


/** creds.id `.field-input`: 16pt side padding, `--radius-field`. */
const FIELD_PAD_X = 16;
const FIELD_RADIUS = Radius.field;
const KIND_CONFIG: Readonly<Record<TextInputKind, KindConfig>> = {
  text: {},
  url: {
    mono: true,
    keyboardType: 'url',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'off',
    textContentType: 'URL',
  },
  handle: { autoCapitalize: 'none', autoCorrect: false, autoComplete: 'off', mono: true },
  // `oneTimeCode`, NEVER `password` — a raw crypto key (nsec/seed) must not
  // be offered to the iOS password manager (that would cache the very thing
  // that must stay uncached). `oneTimeCode` still disables autofill/correct.
  secret: {
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'off',
    textContentType: 'oneTimeCode',
    mono: true,
    secret: true,
  },
  did: { autoCapitalize: 'none', autoCorrect: false, autoComplete: 'off', mono: true },
};

export interface ThemedTextInputProps {
  readonly value: string;
  readonly onChangeText: (v: string) => void;
  readonly kind?: TextInputKind;
  readonly label?: string;
  readonly placeholder?: string;
  /** Leading icon well (`.land-well`) with this SF Symbol in it. */
  readonly icon?: SFSymbol;
  /** A custom node for the well (a brand glyph); wins over `icon`. */
  readonly leading?: ReactNode;
  /** Override the kind's typeface: `true` mono, `false` text. */
  readonly mono?: boolean;
  /** Read-only format guidance rendered inside the field at the trailing edge. */
  readonly inlineSuffix?: string | null;
  /** Read-only fixed part rendered inside the field at the leading edge —
   * the user types only what follows it (e.g. `https://`, `t.me/`). */
  readonly inlinePrefix?: string | null;
  /** Non-null → destructive border + this message under the field. Wins over `hint`. */
  readonly error?: string | null;
  /** Neutral/positive helper under the field (e.g. "✓ npub1…"). Hidden while `error` is set. */
  readonly hint?: string | null;
  readonly hintTone?: 'success' | 'secondary';
  readonly multiline?: boolean;
  readonly editable?: boolean;
  readonly autoFocus?: boolean;
  /** Trailing paste-from-clipboard button — for token/key/URL fields. */
  readonly showPaste?: boolean;
  /** Trailing clear (✕) button, shown only when the field is non-empty. */
  readonly showClear?: boolean;
  /** Called on blur — the seam for on-blur normalization (e.g. auto-prefix https). */
  readonly onBlur?: () => void;
  readonly returnKeyType?: ReturnKeyTypeOptions;
  /** Override the kind default for narrow cases such as numeric PIN entry. */
  readonly keyboardType?: KeyboardTypeOptions;
  readonly autoCapitalize?: RNTextInputProps['autoCapitalize'];
  readonly autoCorrect?: boolean;
  readonly maxLength?: number;
  readonly onSubmitEditing?: () => void;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

const MIN_HEIGHT = 48; // comfortably ≥44pt (rule 6), the web's `--land-ctl`
const MULTILINE_MIN_HEIGHT = 96;
const TRAILING_SLOT = 44;
/** `.land-well` is the row height minus its two border pixels. */
const WELL_WIDTH = MIN_HEIGHT - 2;
const FIELD_FONT_SIZE = 15;

export function ThemedTextInput({
  value,
  onChangeText,
  kind = 'text',
  label,
  placeholder,
  icon,
  leading,
  mono,
  inlineSuffix = null,
  inlinePrefix = null,
  error = null,
  hint = null,
  hintTone = 'secondary',
  multiline = false,
  editable = true,
  autoFocus,
  showPaste = false,
  showClear = false,
  onBlur,
  returnKeyType,
  keyboardType,
  autoCapitalize,
  autoCorrect,
  maxLength,
  onSubmitEditing,
  accessibilityLabel,
  testID,
}: ThemedTextInputProps): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  const cfg = KIND_CONFIG[kind];
  const inputRef = useRef<TextInputInstance>(null);
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const fontFamily = (mono ?? cfg.mono) === true ? MONO : textFont();
  const focusInput = () => { inputRef.current?.focus(); };

  const trailing: ReactNode[] = [];
  if (cfg.secret) {
    trailing.push(
      <TrailingButton
        key="reveal"
        icon={revealed ? 'eye.slash' : 'eye'}
        label={t(revealed ? 'input.hide' : 'input.reveal')}
        onPress={() => {
          setRevealed((r) => !r);
        }}
      />
    );
  }
  if (showPaste) {
    trailing.push(
      <TrailingButton
        key="paste"
        icon="doc.on.clipboard"
        label={t('input.paste')}
        onPress={() => {
          // Lazy-load so importing this primitive never pulls the native
          // clipboard module in at module-load time (keeps unit tests that
          // render Themed components import-safe).
          void (async () => {
            const mod = await import('expo-clipboard');
            const text = await mod.getStringAsync();
            if (text.length > 0) onChangeText(text.trim());
          })();
        }}
      />
    );
  }
  if (showClear && value.length > 0) {
    trailing.push(
      <TrailingButton
        key="clear"
        icon="xmark.circle.fill"
        label={t('input.clear')}
        onPress={() => {
          onChangeText('');
        }}
      />
    );
  }

  const borderColor = error ? c.destructive : focused ? c.primaryBlue : c.divider;
  const well = leading ?? (icon ? <SfIcon name={icon} size={17} color={focused ? c.primaryBlue : c.text3} /> : null);
  const padLeft = inlinePrefix ? 0 : well ? 14 : FIELD_PAD_X;
  const padRight = trailing.length > 0 || inlineSuffix ? 4 : FIELD_PAD_X;

  return (
    <View style={{ gap: label ? 8 : 6 }}>
      {label ? <ThemedText variant="label">{label}</ThemedText> : null}
      {/* A tap on the well still lands the caret in the field (`.land-row`'s
          `cursor: text`). Never wrap the input itself in a pressable, and
          never change the row's shadow on focus: on device both left the
          field unable to take focus (2026-10-30). Focus shows as the border. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'stretch' : 'center',
          minHeight: multiline ? MULTILINE_MIN_HEIGHT : MIN_HEIGHT,
          borderWidth: 1,
          borderColor,
          borderRadius: FIELD_RADIUS,
          backgroundColor: c.cardBg,
        }}>
        {well ? (
          <Pressable
            accessible={false}
            disabled={!editable}
            onPress={focusInput}
            style={{
              width: WELL_WIDTH,
              alignSelf: 'stretch',
              alignItems: 'center',
              justifyContent: multiline ? 'flex-start' : 'center',
              paddingTop: multiline ? 14 : 0,
              backgroundColor: c.chipSurface,
              borderRightWidth: 1,
              borderRightColor: c.divider,
            }}>
            {well}
          </Pressable>
        ) : null}
        {inlinePrefix ? (
          <ThemedText
            numberOfLines={1}
            style={{
              paddingLeft: well ? 14 : FIELD_PAD_X,
              fontFamily: MONO,
              fontSize: FIELD_FONT_SIZE,
              color: c.text3,
              flexShrink: 0,
            }}>
            {inlinePrefix}
          </ThemedText>
        ) : null}
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={c.text3}
          editable={editable}
          autoFocus={autoFocus}
          multiline={multiline}
          secureTextEntry={cfg.secret === true && !revealed}
          keyboardType={keyboardType ?? cfg.keyboardType}
          autoCapitalize={autoCapitalize ?? cfg.autoCapitalize}
          autoCorrect={autoCorrect ?? cfg.autoCorrect}
          maxLength={maxLength}
          autoComplete={cfg.autoComplete}
          textContentType={cfg.textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          accessibilityLabel={accessibilityLabel ?? label ?? placeholder}
          testID={testID}
          selectionColor={c.primaryBlue}
          style={{
            flex: 1,
            alignSelf: 'stretch',
            paddingLeft: padLeft,
            paddingRight: padRight,
            paddingVertical: 12,
            fontSize: FIELD_FONT_SIZE,
            fontFamily,
            color: c.text1,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
        {inlineSuffix ? (
          <View pointerEvents="none" style={{ paddingRight: trailing.length > 0 ? 0 : FIELD_PAD_X, justifyContent: 'center' }}>
            <ThemedText variant="bodySmall" tone="tertiary" numberOfLines={1}>
              {inlineSuffix}
            </ThemedText>
          </View>
        ) : null}
        {trailing.length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
            {trailing}
          </View>
        ) : null}
      </View>
      {error ? (
        <ThemedText variant="caption" tone="error">
          {error}
        </ThemedText>
      ) : hint ? (
        <ThemedText
          variant="caption"
          tone="secondary"
          style={hintTone === 'success' ? { color: Colors.terminalGreen } : undefined}>
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

function TrailingButton({
  icon,
  label,
  onPress,
}: {
  readonly icon: SFSymbol;
  readonly label: string;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <PressableScale
      onPress={onPress}
      haptic="tap"
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: TRAILING_SLOT,
        alignSelf: 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <SfIcon name={icon} size={18} color={Colors.text3} />
    </PressableScale>
  );
}
