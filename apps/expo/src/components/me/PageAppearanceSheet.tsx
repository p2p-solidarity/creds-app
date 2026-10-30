/**
 * PageAppearanceSheet — the Page's Design screen, laid out like Linktree's
 * Design: the page fills the screen at visitor size, painted with the web's
 * template palette (what someone else sees on their phone), and a row of
 * features runs along the bottom — 模板 / 頭貼 / 背景 / 文字 / 頁尾, scrolling
 * sideways. Tapping one slides its controls up over the preview; tapping it
 * again (or the chevron) puts them away, so the preview stays the point.
 *
 * Fonts past the first two, the custom colour and the footer are Pro
 * controls: `proLocked` turns them into a doorway to the plan, and never
 * rewrites an appearance a subscriber already applied.
 */
import type { SFSymbol } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalSheet } from '@/components/common/ModalSheet';
import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedButton, ThemedChoiceChip, ThemedText, ThemedTextInput } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { Radius, shadow } from '@/constants/radius';
import { useThemeColors } from '@/constants/useThemeColors';
import { haptic } from '@/feedback/haptics';
import { DURATION, EASE_OUT, SCALE } from '@/feedback/motion';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import {
  PAGE_BACKGROUND_IDS,
  PAGE_FONT_IDS,
  PAGE_TEMPLATE_IDS,
  type PageTemplateId,
} from '@/page/pageDesign';
import { usePageDesignStore } from '@/page/pageDesignStore';
import { useProGate } from '@/pro/useProGate';
import { saveBio } from '@/profile/quickAddLink';
import type { ProfileRecord } from '@solidarity/shared';

import { SheetHeader } from './AddLinkSheet';
import { PHONE_SCREEN_RADIUS, PageLivePreview } from './PageLivePreview';
import { TEMPLATE_NATIVE_BACKGROUND, paletteFor } from './pagePreviewTheme';

export interface PageAppearanceSheetProps {
  readonly visible: boolean;
  readonly record: ProfileRecord;
  /** Real page address for the preview's `.pub-handle` line, when one exists. */
  readonly handle?: string | null;
  /** 頭貼 › change photo: the photo editor lives on its own screen. */
  readonly onEditAvatar?: () => void;
  readonly onClose: () => void;
}

type DesignTab = 'theme' | 'header' | 'wallpaper' | 'text' | 'footer';

const DESIGN_TABS: readonly { readonly key: DesignTab; readonly icon: SFSymbol }[] = [
  { key: 'theme', icon: 'square.grid.2x2' },
  { key: 'header', icon: 'person.crop.circle' },
  { key: 'wallpaper', icon: 'photo' },
  { key: 'text', icon: 'textformat' },
  { key: 'footer', icon: 'text.alignleft' },
];

/** The feature bar's tile: Linktree's icon square with its name under it. */
const TAB_TILE = 52;
/** The bezel around the preview, so the screen reads as a phone. */
const PHONE_BEZEL = 6;

const ignoreChange = (): void => undefined;

export function PageAppearanceSheet({ visible, onClose, ...props }: PageAppearanceSheetProps): ReactNode {
  return (
    <ModalSheet visible={visible} onRequestClose={onClose}>
      {visible ? <DesignScreen {...props} onClose={onClose} /> : null}
    </ModalSheet>
  );
}

function DesignScreen({
  record,
  handle = null,
  onEditAvatar,
  onClose,
}: Omit<PageAppearanceSheetProps, 'visible'>): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<DesignTab | null>(null);
  const design = usePageDesignStore((state) => state.design);

  const panelIn = reduceMotion
    ? FadeIn.duration(DURATION.enter)
    : SlideInDown.duration(DURATION.enter).easing(EASE_OUT);
  const panelOut = reduceMotion
    ? FadeOut.duration(DURATION.exit)
    : SlideOutDown.duration(DURATION.exit).easing(EASE_OUT);

  return (
    <KeyboardAvoidingView behavior="padding" automaticOffset className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <SheetHeader title={t('pageDesign.design')} canGoBack={false} onClose={onClose} />
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingVertical: 20, paddingBottom: 32 }}>
          {/* The page as a visitor's phone shows it: a bezel around the live preview. */}
          <View
            style={{
              alignSelf: 'center',
              width: '82%',
              padding: PHONE_BEZEL,
              borderRadius: PHONE_SCREEN_RADIUS + PHONE_BEZEL,
              borderWidth: 1,
              borderColor: c.divider,
              backgroundColor: c.cardBg,
              ...shadow('lift'),
            }}>
            <PageLivePreview
              record={record}
              blocks={design.blocks}
              appearance={design.appearance}
              handle={handle}
              variant="public"
            />
          </View>
        </ScrollView>
        {tab !== null ? (
          <Animated.View
            key={tab}
            entering={panelIn}
            exiting={panelOut}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '62%' }}>
            <DesignPanel
              tab={tab}
              record={record}
              onEditAvatar={onEditAvatar === undefined ? undefined : () => { onClose(); onEditAvatar(); }}
              onDismiss={() => { setTab(null); }}
            />
          </Animated.View>
        ) : null}
      </View>
      <DesignTabBar
        selected={tab}
        bottomInset={insets.bottom}
        onSelect={(next) => { setTab((current) => (current === next ? null : next)); }}
      />
    </KeyboardAvoidingView>
  );
}

function DesignTabBar({
  selected,
  bottomInset,
  onSelect,
}: {
  readonly selected: DesignTab | null;
  readonly bottomInset: number;
  readonly onSelect: (tab: DesignTab) => void;
}): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: c.divider, backgroundColor: c.cardBg, paddingBottom: Math.max(bottomInset, 12) }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, gap: 6 }}>
        {DESIGN_TABS.map(({ key, icon }) => {
          const active = selected === key;
          const label = t(`pageDesign.tab.${key}`);
          return (
            <PressableScale
              key={key}
              haptic="tap"
              scaleTo={SCALE.tile}
              onPress={() => { onSelect(key); }}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
              style={{ width: TAB_TILE + 20, alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: TAB_TILE,
                  height: TAB_TILE,
                  borderRadius: Radius.card,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: active ? c.primaryBlue : c.divider,
                  backgroundColor: active ? c.chipSurface : c.pageBg,
                }}>
                <SfIcon name={icon} size={20} color={active ? c.primaryBlue : c.text1} />
              </View>
              <ThemedText variant="caption" numberOfLines={1} style={{ color: active ? c.primaryBlue : c.text2 }}>
                {label}
              </ThemedText>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** The slid-up controls of one feature. */
function DesignPanel({
  tab,
  record,
  onEditAvatar,
  onDismiss,
}: {
  readonly tab: DesignTab;
  readonly record: ProfileRecord;
  readonly onEditAvatar: (() => void) | undefined;
  readonly onDismiss: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  return (
    <View
      style={{
        borderTopLeftRadius: Radius.sheet,
        borderTopRightRadius: Radius.sheet,
        borderWidth: 1,
        borderBottomWidth: 0,
        borderColor: c.divider,
        backgroundColor: c.cardBg,
        ...shadow('sheet'),
      }}>
      <View className="flex-row items-center justify-between" style={{ paddingLeft: 16, paddingTop: 6 }}>
        <ThemedText variant="titleMedium" accessibilityRole="header">{t(`pageDesign.tab.${tab}`)}</ThemedText>
        <PressableScale
          haptic="tap"
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={t('common.done')}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <SfIcon name="chevron.down" size={15} color={c.text2} />
        </PressableScale>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20, paddingTop: 4, gap: 14 }}>
        {tab === 'theme' ? <ThemeControls /> : null}
        {tab === 'header' ? <HeaderControls record={record} onEditAvatar={onEditAvatar} /> : null}
        {tab === 'wallpaper' ? <WallpaperControls /> : null}
        {tab === 'text' ? <TextControls /> : null}
        {tab === 'footer' ? <FooterControls /> : null}
      </ScrollView>
    </View>
  );
}

function ThemeControls(): ReactNode {
  const { t } = useTranslation();
  const appearance = usePageDesignStore((state) => state.design.appearance);
  const setAppearance = usePageDesignStore((state) => state.setAppearance);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
      {PAGE_TEMPLATE_IDS.map((template) => (
        <TemplateSwatch
          key={template}
          template={template}
          label={t(`pageDesign.template.${template}`)}
          selected={appearance.template === template}
          onPress={() => {
            // The template's own ground, so creds.id paints the template
            // rather than flattening it to an override.
            setAppearance({
              template,
              background: TEMPLATE_NATIVE_BACKGROUND[template],
              customBackground: null,
              ...(template === 'journal' ? { font: 'serif' as const } : {}),
            });
          }}
        />
      ))}
    </ScrollView>
  );
}

function HeaderControls({
  record,
  onEditAvatar,
}: {
  readonly record: ProfileRecord;
  readonly onEditAvatar: (() => void) | undefined;
}): ReactNode {
  const { t } = useTranslation();
  const [bio, setBio] = useState(record.bio);
  const [saving, setSaving] = useState(false);
  return (
    <>
      {onEditAvatar !== undefined ? (
        <ThemedButton label={t('meHome.editPhoto')} icon="person.crop.circle" variant="secondary" fullWidth onPress={onEditAvatar} />
      ) : null}
      <ThemedTextInput
        label={t('meEdit.bio')}
        value={bio}
        onChangeText={setBio}
        placeholder={t('meEdit.bioPlaceholder')}
        maxLength={500}
        multiline
      />
      <ThemedButton
        label={t('common.save')}
        fullWidth
        loading={saving}
        disabled={bio.trim() === record.bio.trim()}
        onPress={() => {
          setSaving(true);
          void saveBio(bio).then((ok) => {
            setSaving(false);
            if (ok) haptic('success');
            else pushToast(t('meEdit.saveFailed'), 'error');
          });
        }}
      />
    </>
  );
}

function WallpaperControls(): ReactNode {
  const { t } = useTranslation();
  const { isPro, openUpgrade } = useProGate();
  const appearance = usePageDesignStore((state) => state.design.appearance);
  const setAppearance = usePageDesignStore((state) => state.setAppearance);
  return (
    <>
      <View className="flex-row flex-wrap gap-2">
        {PAGE_BACKGROUND_IDS.map((background) => (
          <ThemedChoiceChip
            key={background}
            label={t(`pageDesign.background.${background}`)}
            selected={appearance.background === background && appearance.customBackground === null}
            onPress={() => { setAppearance({ background, customBackground: null }); }}
          />
        ))}
      </View>
      <CustomColorInput
        appearance={appearance}
        locked={!isPro}
        onOpenPro={openUpgrade}
        onChange={(customBackground) => { setAppearance({ customBackground }); }}
      />
    </>
  );
}

function TextControls(): ReactNode {
  const { t } = useTranslation();
  const { isPro, openUpgrade } = useProGate();
  const appearance = usePageDesignStore((state) => state.design.appearance);
  const setAppearance = usePageDesignStore((state) => state.setAppearance);
  return (
    <View className="flex-row flex-wrap gap-2">
      {PAGE_FONT_IDS.map((font, index) => (
        <ThemedChoiceChip
          key={font}
          label={t(`pageDesign.font.${font}`)}
          selected={appearance.font === font}
          pro={index > 1 && !isPro}
          onPress={() => {
            if (index > 1 && !isPro) {
              openUpgrade();
              return;
            }
            setAppearance({ font });
          }}
        />
      ))}
    </View>
  );
}

function FooterControls(): ReactNode {
  const { t } = useTranslation();
  const { isPro, openUpgrade } = useProGate();
  const appearance = usePageDesignStore((state) => state.design.appearance);
  const setAppearance = usePageDesignStore((state) => state.setAppearance);
  return (
    <>
      <View className="flex-row items-center justify-between">
        <ThemedText variant="bodyMedium">{t('pageDesign.showBrand')}</ThemedText>
        <Switch
          style={{ alignSelf: 'center' }}
          value={appearance.showBrand}
          onValueChange={isPro ? (showBrand) => { setAppearance({ showBrand }); } : openUpgrade}
          accessibilityHint={isPro ? undefined : t('pageDesign.proControl')}
          trackColor={{ true: Colors.primaryBlue }}
        />
      </View>
      <ProTextField
        label={t('pageDesign.footerText')}
        value={appearance.footerText}
        maxLength={40}
        hint={t('pageDesign.proControl')}
        locked={!isPro}
        onOpenPro={openUpgrade}
        onChangeText={(footerText) => { setAppearance({ footerText }); }}
      />
    </>
  );
}

function CustomColorInput({
  appearance,
  locked,
  onOpenPro,
  onChange,
}: {
  readonly appearance: ReturnType<typeof usePageDesignStore.getState>['design']['appearance'];
  readonly locked: boolean;
  readonly onOpenPro: () => void;
  readonly onChange: (value: string | null) => void;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <ProTextField
      label={t('pageDesign.customColor')}
      value={appearance.customBackground ?? ''}
      placeholder={t('pageDesign.colorPlaceholder')}
      maxLength={7}
      hint={t('pageDesign.proControl')}
      locked={locked}
      onOpenPro={onOpenPro}
      onChangeText={(next) => { onChange(next.length > 0 ? next : null); }}
    />
  );
}

function ProTextField({
  label,
  value,
  placeholder,
  maxLength,
  hint,
  locked,
  onOpenPro,
  onChangeText,
}: {
  readonly label: string;
  readonly value: string;
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly hint: string;
  readonly locked: boolean;
  readonly onOpenPro: () => void;
  readonly onChangeText: (value: string) => void;
}): ReactNode {
  if (!locked) {
    return (
      <ThemedTextInput
        label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        maxLength={maxLength}
      />
    );
  }
  return (
    <PressableScale
      onPress={onOpenPro}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      containerStyle={{ alignSelf: 'stretch' }}
      style={{ alignSelf: 'stretch' }}>
      <View pointerEvents="none">
        <ThemedTextInput
          label={label}
          value={value}
          onChangeText={ignoreChange}
          editable={false}
          placeholder={placeholder}
          maxLength={maxLength}
          hint={hint}
        />
      </View>
    </PressableScale>
  );
}

/** A template as its visitors see it: the ground, a name bar and two cards. */
function TemplateSwatch({
  template,
  label,
  selected,
  onPress,
}: {
  readonly template: PageTemplateId;
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const c = useThemeColors();
  const palette = paletteFor({
    template,
    font: 'sans',
    background: TEMPLATE_NATIVE_BACKGROUND[template],
    customBackground: null,
    showBrand: true,
    footerText: '',
  });
  const [first = palette.cardBg, second, ...rest] = palette.stops;
  const card = {
    height: 12,
    borderRadius: Math.min(palette.cardRadius, 6),
    borderWidth: 1,
    borderColor: palette.cardBorder,
    backgroundColor: palette.cardBg,
  } as const;
  const face = (
    <View style={{ flex: 1, padding: 10, gap: 6, justifyContent: 'center' }}>
      <View style={{ alignSelf: 'center', width: 18, height: 18, borderRadius: Radius.pill, backgroundColor: palette.iconBg }} />
      <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: Radius.xs, backgroundColor: palette.text }} />
      <View style={card} />
      <View style={card} />
    </View>
  );
  return (
    <PressableScale
      haptic="tap"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={{ alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: 72,
          height: 104,
          borderRadius: Radius.card,
          borderWidth: 2,
          borderColor: selected ? c.primaryBlue : c.divider,
          overflow: 'hidden',
          backgroundColor: first,
        }}>
        {second === undefined ? face : (
          <LinearGradient colors={[first, second, ...rest]} style={{ flex: 1 }}>{face}</LinearGradient>
        )}
      </View>
      <ThemedText variant="caption" style={{ color: selected ? c.primaryBlue : c.text2 }}>{label}</ThemedText>
    </PressableScale>
  );
}
