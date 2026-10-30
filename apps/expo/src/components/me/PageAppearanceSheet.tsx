import { type ReactNode } from 'react';
import { Modal, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/common/PressableScale';
import { LinearGradient } from 'expo-linear-gradient';

import { ThemedButton, ThemedChoiceChip, ThemedSurface, ThemedText, ThemedTextInput } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { Radius } from '@/constants/radius';
import { useThemeColors } from '@/constants/useThemeColors';
import { useTranslation } from '@/i18n';
import {
  PAGE_BACKGROUND_IDS,
  PAGE_FONT_IDS,
  PAGE_TEMPLATE_IDS,
  type PageTemplateId,
} from '@/page/pageDesign';
import { usePageDesignStore } from '@/page/pageDesignStore';
import { useProGate } from '@/pro/useProGate';
import type { ProfileRecord } from '@solidarity/shared';

import { PageLivePreview } from './PageLivePreview';
import { TEMPLATE_NATIVE_BACKGROUND, paletteFor } from './pagePreviewTheme';

export interface PageAppearanceSheetProps {
  readonly visible: boolean;
  readonly record: ProfileRecord;
  /** Real page address for the preview's `.pub-handle` line, when one exists. */
  readonly handle?: string | null;
  readonly onClose: () => void;
}

const ignoreChange = (): void => undefined;

export function PageAppearanceSheet({
  visible,
  record,
  handle = null,
  onClose,
}: PageAppearanceSheetProps): ReactNode {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Every control in this sheet below the template picker is a Pro control.
  // `proLocked` decides whether it is a real control or a paywall doorway —
  // it never rewrites an appearance a subscriber already applied.
  const { isPro, openUpgrade } = useProGate();
  const proLocked = !isPro;
  const design = usePageDesignStore((state) => state.design);
  const setAppearance = usePageDesignStore((state) => state.setAppearance);
  const { appearance } = design;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: Colors.overlayBg }}>
        <View className="overflow-hidden rounded-t-sheet bg-pageBg" style={{ maxHeight: '92%' }}>
          <ScrollView
            contentContainerStyle={{
              padding: 16,
              paddingTop: 20,
              paddingBottom: insets.bottom + 24,
              gap: 20,
            }}>
            <View className="flex-row items-center justify-between">
              <ThemedText variant="titleLarge">{t('pageDesign.appearance')}</ThemedText>
              <ThemedButton
                label={t('common.done')}
                variant="secondary"
                size="sm"
                onPress={onClose}
              />
            </View>

            <PageLivePreview
              record={record}
              blocks={design.blocks}
              appearance={appearance}
              handle={handle}
            />

            <ControlSection title={t('pageDesign.templates')}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {PAGE_TEMPLATE_IDS.map((template) => (
                  <TemplateSwatch
                    key={template}
                    template={template}
                    label={t(`pageDesign.template.${template}`)}
                    selected={appearance.template === template}
                    onPress={() => {
                      // The template's own ground, so creds.id paints the
                      // template rather than flattening it to an override.
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
            </ControlSection>

            <ControlSection title={t('pageDesign.font')}>
              <View className="flex-row flex-wrap gap-2">
                {PAGE_FONT_IDS.map((font, index) => (
                  <ThemedChoiceChip
                    key={font}
                    label={t(`pageDesign.font.${font}`)}
                    selected={appearance.font === font}
                    pro={index > 1 && proLocked}
                    onPress={() => {
                      if (index > 1 && proLocked) {
                        openUpgrade();
                        return;
                      }
                      setAppearance({ font });
                    }}
                  />
                ))}
              </View>
            </ControlSection>

            <ControlSection title={t('pageDesign.background')}>
              <View className="flex-row flex-wrap gap-2">
                {PAGE_BACKGROUND_IDS.map((background) => (
                  <ThemedChoiceChip
                    key={background}
                    label={t(`pageDesign.background.${background}`)}
                    selected={
                      appearance.background === background && appearance.customBackground === null
                    }
                    onPress={() => {
                      setAppearance({ background, customBackground: null });
                    }}
                  />
                ))}
              </View>
              <CustomColorInput
                appearance={appearance}
                locked={proLocked}
                onOpenPro={openUpgrade}
                onChange={(customBackground) => { setAppearance({ customBackground }); }}
              />
            </ControlSection>

            <ControlSection title={t('pageDesign.footer')}>
              <ThemedSurface padded className="gap-3">
                <View className="flex-row items-center justify-between">
                  <ThemedText variant="bodyMedium">{t('pageDesign.showBrand')}</ThemedText>
                  <Switch
                    value={appearance.showBrand}
                    onValueChange={
                      proLocked
                        ? openUpgrade
                        : (showBrand) => { setAppearance({ showBrand }); }
                    }
                    accessibilityHint={proLocked ? t('pageDesign.proControl') : undefined}
                    trackColor={{ true: Colors.primaryBlue }}
                  />
                </View>
                <ProTextField
                  label={t('pageDesign.footerText')}
                  value={appearance.footerText}
                  maxLength={40}
                  hint={t('pageDesign.proControl')}
                  locked={proLocked}
                  onOpenPro={openUpgrade}
                  onChangeText={(footerText) => { setAppearance({ footerText }); }}
                />
              </ThemedSurface>
            </ControlSection>
          </ScrollView>
        </View>
      </View>
    </Modal>
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

function ControlSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="gap-3">
      <ThemedText accessibilityRole="header" variant="label" tone="tertiary">
        {title}
      </ThemedText>
      {children}
    </View>
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
