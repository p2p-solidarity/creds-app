/**
 * AddLinkSheet — the one add-link UI (Page tab, onboarding, Me › Edit).
 *
 *   compose  paste first: the field takes a URL (or the clipboard's, one tap),
 *            the platform is detected as you type and the row previews with
 *            the picture fetched from the page; no URL → pick a platform and
 *            type the handle.
 *   details  a picked platform's handle field, or the full editor (label,
 *            visibility) when an existing link is edited.
 *   saving / added — only when `onSubmit` returns a promise (the Page tab
 *            saves at once): the added card can swap in the fetched profile
 *            picture and, for a checkable platform, runs the link check right
 *            here (`SocialVerifyPanel`) — add to green check in one sheet.
 *
 * Without `onSave` (onboarding draft, Me › Edit draft) `onSubmit` gets the
 * value and the caller closes the sheet, as before.
 */
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalSheet } from '@/components/common/ModalSheet';
import { PressableScale } from '@/components/common/PressableScale';
import { LinkIcon } from '@/components/icons/LinkIcon';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedButton, ThemedSurface, ThemedText, ThemedTextInput } from '@/components/themed';
import { SocialVerifyPanel } from '@/components/verify/SocialVerifyPanel';
import { Colors } from '@/constants/Colors';
import { Radius } from '@/constants/radius';
import { useThemeColors } from '@/constants/useThemeColors';
import { fadeUpIn, zoomFadeIn, DURATION } from '@/feedback/motion';
import { useTranslation } from '@/i18n';
import {
  composeLinkUrl,
  detectLinkFromUrl,
  displayLinkText,
  expandLinkPresetHandle,
  isHttpsLinkUrl,
  isLinkPresetHandleInput,
  LINK_LABEL_PRESETS,
  linkInputModelFor,
  linkPresetForEditableUrl,
  normalizeLinkUrl,
  type LinkLabelPreset,
} from '@/profile/linkUrl';
import { brandIconForLink, linkDisplay } from '@/profile/linkPresentation';
import type { LinkVisibility } from '@/profile/projection';
import { deviceAttestSupported } from '@/witness/deviceKey';
import { socialTargetForLink, type SocialTarget } from '@solidarity/shared';

import { RowGroup } from './AddListRow';
import { LinkVisibilityControl } from './PublishPreviewSheet';

export interface LinkSheetValue {
  readonly label: string;
  readonly url: string;
  readonly preset: LinkLabelPreset | null;
  readonly visibility: LinkVisibility;
}

/** What a saving `onSubmit` reports back. */
export type AddLinkOutcome =
  | {
      readonly kind: 'saved';
      /** The fetched profile picture became the Page photo in the same save. */
      readonly avatarApplied: string | null;
      /** A fetched profile picture the owner may swap in (the Page has one). */
      readonly avatarSuggestion: string | null;
    }
  | { readonly kind: 'failed' };

export interface AddLinkSheetProps {
  readonly visible: boolean;
  /** `null` opens the label-free add flow; a value opens the full edit flow. */
  readonly initialLink: LinkSheetValue | null;
  /** Draft use (onboarding, Me › Edit): hand the value back; the caller closes. */
  readonly onSubmit?: (link: LinkSheetValue) => void;
  /** Page use: save now; the sheet stays for the added step. Wins over `onSubmit`. */
  readonly onSave?: (link: LinkSheetValue) => Promise<AddLinkOutcome>;
  /** Swap the Page photo for a fetched profile picture (added step). */
  readonly onUseAvatar?: (url: string) => Promise<boolean>;
  readonly onClose: () => void;
}

type Step =
  | { readonly kind: 'compose' }
  | { readonly kind: 'details' }
  | { readonly kind: 'saving'; readonly link: LinkSheetValue }
  | {
      readonly kind: 'added';
      readonly link: LinkSheetValue;
      readonly avatarApplied: string | null;
      readonly avatarSuggestion: string | null;
    };

interface Draft {
  readonly preset: LinkLabelPreset | null;
  readonly input: string;
  readonly label: string;
  readonly visibility: LinkVisibility;
}

function initialDraft(initialLink: LinkSheetValue | null): Draft {
  if (initialLink === null) return { preset: null, input: '', label: '', visibility: 'public' };
  const detected = detectLinkFromUrl(initialLink.url);
  const detectedPreset = initialLink.preset ?? detected?.preset ?? null;
  const normalizedUrl = normalizeLinkUrl(initialLink.url);
  const preset = linkPresetForEditableUrl(detectedPreset, normalizedUrl);
  return {
    preset,
    input: displayLinkText(preset, normalizedUrl),
    label: initialLink.label,
    visibility: initialLink.visibility,
  };
}

function detailsUrl(preset: LinkLabelPreset | null, input: string): string {
  const trimmed = input.trim();
  const model = linkInputModelFor(preset);
  if (model.handle) {
    if (!isLinkPresetHandleInput(trimmed)) return '';
    const expanded = expandLinkPresetHandle(preset, trimmed);
    return expanded === trimmed ? composeLinkUrl(preset, trimmed) : normalizeLinkUrl(expanded);
  }
  return composeLinkUrl(preset, trimmed);
}

/** A pasted value only counts as a link when it names a real host. */
export function detectPasted(input: string): ReturnType<typeof detectLinkFromUrl> {
  const detected = detectLinkFromUrl(input);
  if (detected === null) return null;
  try {
    return new URL(detected.url).hostname.includes('.') ? detected : null;
  } catch {
    return null;
  }
}

/** The link check is offered only where this phone can actually run it. */
function checkTargetFor(url: string): SocialTarget | null {
  return deviceAttestSupported() ? socialTargetForLink(url) : null;
}

export function AddLinkSheet(props: AddLinkSheetProps): ReactNode {
  return (
    <ModalSheet visible={props.visible} onRequestClose={props.onClose}>
      {props.visible ? <AddLinkFlow {...props} /> : null}
    </ModalSheet>
  );
}

export interface AddLinkFlowProps extends Omit<AddLinkSheetProps, 'visible'> {
  /** Start on this platform's handle field (the Page add sheet's 建議 rows). */
  readonly initialPreset?: LinkLabelPreset | null;
  /** A URL already pasted in the Page add sheet: saved at once when `onSave` is set. */
  readonly initialUrl?: string | null;
  /** Back from the first step to whatever hosts the flow (the Page add sheet). */
  readonly onExit?: () => void;
}

/** The add/edit-link flow without its modal, so the Page tab's one add sheet
 *  can host it as a step. */
export function AddLinkFlow({
  initialLink,
  initialPreset = null,
  initialUrl = null,
  onSubmit,
  onSave,
  onUseAvatar,
  onClose,
  onExit,
}: AddLinkFlowProps): ReactNode {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const editing = initialLink !== null;
  const [step, setStep] = useState<Step>(
    editing || initialPreset !== null ? { kind: 'details' } : { kind: 'compose' },
  );
  const [draft, setDraft] = useState<Draft>(() =>
    initialLink === null && initialPreset !== null
      ? { preset: initialPreset, input: '', label: '', visibility: 'public' }
      : initialLink === null && initialUrl !== null
        ? { preset: null, input: initialUrl, label: '', visibility: 'public' }
        : initialDraft(initialLink),
  );
  const clipboardUrl = useClipboardLink(step.kind === 'compose' && draft.input.length === 0);

  const detected = step.kind === 'compose' ? detectPasted(draft.input) : null;
  const preparedUrl = step.kind === 'details' ? detailsUrl(draft.preset, draft.input) : '';
  const urlValid = step.kind === 'compose' ? detected !== null : isHttpsLinkUrl(preparedUrl);
  const labelValid = !editing || draft.label.trim().length > 0;
  const canSubmit = urlValid && labelValid;
  const inputError = draft.input.trim().length > 0 && !urlValid ? t('profileLink.httpsOnly') : null;

  const valueToSubmit = (): LinkSheetValue | null => {
    if (step.kind === 'compose') {
      if (detected === null) return null;
      return {
        label: detected.preset === null ? detected.label : t(`profileLink.preset.${detected.preset}`),
        url: detected.url,
        preset: linkPresetForEditableUrl(detected.preset, detected.url),
        visibility: 'public',
      };
    }
    return {
      label: editing ? draft.label.trim() : draft.preset === null ? '' : t(`profileLink.preset.${draft.preset}`),
      url: preparedUrl,
      preset: draft.preset,
      visibility: editing ? draft.visibility : 'public',
    };
  };

  const submit = () => {
    if (!canSubmit) return;
    const value = valueToSubmit();
    if (value === null) return;
    if (onSave === undefined) {
      onSubmit?.(value);
      return;
    }
    setStep({ kind: 'saving', link: value });
    void onSave(value).then((outcome) => {
      if (outcome.kind === 'saved') {
        setStep({ kind: 'added', link: value, avatarApplied: outcome.avatarApplied, avatarSuggestion: outcome.avatarSuggestion });
      } else {
        setStep({ kind: 'compose' });
      }
    });
  };

  const choosePreset = (preset: LinkLabelPreset) => {
    setDraft({ preset, input: '', label: '', visibility: 'public' });
    setStep({ kind: 'details' });
  };

  const backToCompose = () => {
    if (onExit !== undefined) {
      onExit();
      return;
    }
    setDraft({ preset: null, input: '', label: '', visibility: 'public' });
    setStep({ kind: 'compose' });
  };

  // A URL pasted into the Page add sheet was already the owner's choice:
  // save it straight away instead of asking for the same tap twice.
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (autoSubmitted.current || initialUrl === null || onSave === undefined) return;
    autoSubmitted.current = true;
    submit();
  }, []);

  const inputModel = linkInputModelFor(draft.preset);

  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <SheetHeader
        title={t(editing ? 'meEdit.linkSheet.editTitle' : step.kind === 'added' ? 'meEdit.linkSheet.addedTitle' : 'meEdit.linkSheet.addTitle')}
        canGoBack={!editing && (step.kind === 'details' || (onExit !== undefined && step.kind === 'compose'))}
        onBack={backToCompose}
        onClose={onClose}
      />

      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={16}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 20 }}>
        {step.kind === 'compose' ? (
          <>
            <ThemedTextInput
              kind="url"
              label={t('meEdit.linkSheet.pasteLabel')}
              value={draft.input}
              onChangeText={(input) => {
                setDraft((current) => ({ ...current, input }));
              }}
              placeholder={t('meEdit.linkSheet.pastePlaceholder')}
              error={inputError}
              autoFocus
              showPaste
              showClear
              returnKeyType="done"
              onSubmitEditing={canSubmit ? submit : undefined}
            />
            {clipboardUrl !== null ? (
              <ClipboardChip
                url={clipboardUrl}
                onUse={() => {
                  setDraft((current) => ({ ...current, input: clipboardUrl }));
                }}
              />
            ) : null}
            {detected !== null ? <DetectedPreview url={detected.url} label={detected.label} /> : null}
            <ThemedButton
              label={t('meEdit.linkSheet.add')}
              variant="primary"
              fullWidth
              disabled={!canSubmit}
              onPress={submit}
            />
            <PlatformGrid onChoose={choosePreset} />
          </>
        ) : null}

        {step.kind === 'details' ? (
          <>
            {editing ? (
              <ThemedTextInput
                label={t('meEdit.linkLabelPlaceholder')}
                value={draft.label}
                onChangeText={(label) => {
                  setDraft((current) => ({ ...current, label }));
                }}
                placeholder={t('meEdit.linkLabelPlaceholder')}
                autoFocus
                showClear
              />
            ) : null}
            <ThemedTextInput
              kind={inputModel.handle ? 'handle' : 'url'}
              label={t(inputModel.handle ? 'meEdit.linkSheet.handleLabel' : 'meEdit.linkSheet.urlLabel')}
              value={draft.input}
              onChangeText={(input) => {
                setDraft((current) => ({ ...current, input }));
              }}
              inlinePrefix={inputModel.prefix}
              placeholder={
                inputModel.handle
                  // The prefix shows the URL shape (`github.com/`, `threads.com/@`),
                  // so the bare handle never starts with an @ of its own.
                  ? t('profileLink.handlePlaceholder').replace(/^@/u, '')
                  : t('profileLink.urlPlaceholder')
              }
              error={inputError}
              autoFocus={!editing}
              showClear
              returnKeyType="done"
              onSubmitEditing={canSubmit ? submit : undefined}
            />
            {!editing && isHttpsLinkUrl(preparedUrl) ? (
              <DetectedPreview url={preparedUrl} label={t(`profileLink.preset.${draft.preset ?? 'website'}`)} />
            ) : null}
            {editing ? (
              <LinkVisibilityControl
                selected={draft.visibility}
                onSelect={(visibility) => {
                  setDraft((current) => ({ ...current, visibility }));
                }}
              />
            ) : null}
            <ThemedButton
              label={t(editing ? 'meEdit.linkSheet.save' : 'meEdit.linkSheet.add')}
              variant="primary"
              fullWidth
              disabled={!canSubmit}
              onPress={submit}
            />
          </>
        ) : null}

        {step.kind === 'saving' ? (
          <>
            <DetectedPreview url={step.link.url} label={step.link.label} />
            <ThemedButton label={t('meEdit.linkSheet.saving')} variant="primary" fullWidth loading onPress={() => {}} />
          </>
        ) : null}

        {step.kind === 'added' ? (
          <AddedStep
            link={step.link}
            avatarApplied={step.avatarApplied}
            avatarSuggestion={step.avatarSuggestion}
            onUseAvatar={onUseAvatar}
            onDone={onClose}
          />
        ) : null}
      </KeyboardAwareScrollView>
    </View>
  );
}

/** The clipboard's link, offered once the field is empty. `hasUrlAsync`
 * never shows iOS's paste prompt; only the tap reads the clipboard. */
function useClipboardLink(enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void Clipboard.hasUrlAsync()
      .then(async (has) => (has ? await Clipboard.getUrlAsync() : null))
      .then((value) => {
        if (!cancelled && value !== null && detectPasted(value) !== null) setUrl(value);
      })
      .catch(() => {
        // No clipboard access: the paste button in the field still works.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return enabled ? url : null;
}

function ClipboardChip({ url, onUse }: { readonly url: string; readonly onUse: () => void }): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  return (
    <PressableScale
      haptic="tap"
      onPress={onUse}
      accessibilityRole="button"
      accessibilityLabel={t('meEdit.linkSheet.useClipboard', { url })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: Radius.button,
        backgroundColor: c.chipSurface,
      }}>
      <SfIcon name="doc.on.clipboard" size={14} color={c.primaryBlue} />
      <ThemedText variant="bodySmall" numberOfLines={1} ellipsizeMode="middle" style={{ flex: 1 }}>
        {t('meEdit.linkSheet.useClipboard', { url: linkDisplay('', url).text })}
      </ThemedText>
    </PressableScale>
  );
}

/** The row the link will become, with the picture fetched from its page. */
function DetectedPreview({ url, label }: { readonly url: string; readonly label: string }): ReactNode {
  const c = useThemeColors();
  const reduceMotion = useReducedMotion();
  const display = linkDisplay(label, url);
  return (
    <Animated.View entering={reduceMotion ? undefined : zoomFadeIn(DURATION.enter)}>
      <ThemedSurface variant="card" className="flex-row items-center" style={{ gap: 12, padding: 12 }}>
        <LinkIcon label={label} url={url} size={40} glyph={20} surface={c.chipSurface} />
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText variant="bodyMedium" numberOfLines={1} ellipsizeMode="middle">
            {display.text}
          </ThemedText>
          <ThemedText variant="caption" tone="tertiary" numberOfLines={1}>
            {label}
          </ThemedText>
        </View>
      </ThemedSurface>
    </Animated.View>
  );
}

/** No URL at hand → pick the platform, then type only the handle. One
 *  vertical 建議-style list (badge, name, what it is for), not a chip grid. */
function PlatformGrid({ onChoose }: { readonly onChoose: (preset: LinkLabelPreset) => void }): ReactNode {
  const { t } = useTranslation();
  return (
    <RowGroup
      title={t('meEdit.linkSheet.choosePlatform')}
      rows={LINK_LABEL_PRESETS.map((preset) => ({
        key: preset,
        title: t(`profileLink.preset.${preset}`),
        description: t(`pageAdd.platformDesc.${preset}`),
        keywords: preset,
        badge: brandIconForLink(preset, ''),
        onPress: () => { onChoose(preset); },
      }))}
    />
  );
}

function AddedStep({
  link,
  avatarApplied,
  avatarSuggestion,
  onUseAvatar,
  onDone,
}: {
  readonly link: LinkSheetValue;
  readonly avatarApplied: string | null;
  readonly avatarSuggestion: string | null;
  readonly onUseAvatar?: (url: string) => Promise<boolean>;
  readonly onDone: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const target = checkTargetFor(link.url);
  const [checking, setChecking] = useState(false);
  const [avatar, setAvatar] = useState<{ readonly url: string; readonly state: 'offered' | 'saving' | 'used' } | null>(
    avatarApplied !== null ? { url: avatarApplied, state: 'used' } : avatarSuggestion !== null ? { url: avatarSuggestion, state: 'offered' } : null,
  );

  return (
    <View style={{ gap: 16 }}>
      <Animated.View entering={fadeUpIn(0, reduceMotion)}>
        <DetectedPreview url={link.url} label={link.label} />
      </Animated.View>
      <Animated.View entering={fadeUpIn(1, reduceMotion)} className="flex-row items-center" style={{ gap: 8 }}>
        <SfIcon name="checkmark.circle.fill" size={18} color={Colors.terminalGreen} />
        <ThemedText variant="bodyMedium">{t('meEdit.linkSheet.addedBody')}</ThemedText>
      </Animated.View>

      {avatar !== null ? (
        <Animated.View entering={fadeUpIn(2, reduceMotion)}>
          <AvatarRow
            url={avatar.url}
            state={avatar.state}
            onUse={
              onUseAvatar === undefined
                ? null
                : () => {
                    setAvatar({ url: avatar.url, state: 'saving' });
                    void onUseAvatar(avatar.url).then((used) => {
                      setAvatar({ url: avatar.url, state: used ? 'used' : 'offered' });
                    });
                  }
            }
          />
        </Animated.View>
      ) : null}

      {target !== null ? (
        checking ? (
          <SocialVerifyPanel target={target} showTarget={false} onFinish={onDone} finishLabel={t('meEdit.linkSheet.done')} />
        ) : (
          <Animated.View entering={fadeUpIn(3, reduceMotion)} style={{ gap: 10 }}>
            <ThemedText variant="bodySmall" tone="secondary">
              {t('meEdit.linkSheet.checkPrompt', { platform: t(`zktls.platform.${target.platform}`) })}
            </ThemedText>
            <ThemedButton
              label={t('meEdit.linkSheet.checkNow')}
              variant="primary"
              fullWidth
              onPress={() => {
                setChecking(true);
              }}
            />
            <ThemedButton label={t('meEdit.linkSheet.later')} variant="secondary" fullWidth onPress={onDone} />
          </Animated.View>
        )
      ) : (
        <ThemedButton label={t('meEdit.linkSheet.done')} variant="primary" fullWidth onPress={onDone} />
      )}
    </View>
  );
}

function AvatarRow({
  url,
  state,
  onUse,
}: {
  readonly url: string;
  readonly state: 'offered' | 'saving' | 'used';
  readonly onUse: (() => void) | null;
}): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  return (
    <ThemedSurface variant="inset" className="flex-row items-center" style={{ gap: 12, padding: 12 }}>
      <Image
        source={{ uri: url }}
        contentFit="cover"
        transition={DURATION.enter}
        accessibilityIgnoresInvertColors
        style={{ width: 36, height: 36, borderRadius: Radius.pill, backgroundColor: c.chipSurface }}
      />
      <ThemedText variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
        {t(state === 'used' ? 'meEdit.linkSheet.avatarUsed' : 'meEdit.linkSheet.avatarOffer')}
      </ThemedText>
      {state !== 'used' && onUse !== null ? (
        <ThemedButton
          label={t('meEdit.linkSheet.avatarUse')}
          variant="secondary"
          size="sm"
          loading={state === 'saving'}
          onPress={onUse}
        />
      ) : null}
    </ThemedSurface>
  );
}

export function SheetHeader({
  title,
  canGoBack,
  onBack,
  onClose,
}: {
  readonly title: string;
  readonly canGoBack: boolean;
  readonly onBack?: () => void;
  readonly onClose: () => void;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <View className="min-h-14 flex-row items-center justify-between border-b border-divider px-4">
      {canGoBack ? (
        <PressableScale
          haptic="tap"
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('meEdit.linkSheet.back')}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <SfIcon name="chevron.left" size={16} color={Colors.text1} />
        </PressableScale>
      ) : (
        <View style={{ width: 44 }} />
      )}
      <ThemedText variant="titleMedium">{title}</ThemedText>
      <PressableScale
        haptic="tap"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('meEdit.linkSheet.close')}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <SfIcon name="xmark" size={16} color={Colors.text1} />
      </PressableScale>
    </View>
  );
}
