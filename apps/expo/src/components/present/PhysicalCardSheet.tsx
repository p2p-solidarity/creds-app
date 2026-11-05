import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { ModalSheet, sheetTopInset } from '@/components/common/ModalSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CredsMark } from '@/components/brand/CredsMark';
import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { CARD_FINISHES, CardFaceBackground, finishPalette, finishSwatch, useCardFinish } from '@/components/present/cardFinish';
import { SheetHeader } from '@/components/me/AddLinkSheet';
import { ThemedButton, ThemedSurface, ThemedSwitch, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { useThemeColors } from '@/constants/useThemeColors';
import { Radius } from '@/constants/radius';
import { useTranslation } from '@/i18n';
import type { PhysicalCardMaterial } from '@/present/presentModel';
import { usePreferences } from '@/settings/preferences';

export interface PhysicalCardSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** What the card would carry — the owner's real name and page address. */
  readonly name: string | null;
  readonly address: string;
}

export function PhysicalCardSheet({
  visible,
  onClose,
  name,
  address,
}: PhysicalCardSheetProps): ReactNode {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const material = useCardFinish();
  const engraveName = usePreferences(
    (state) => state.presentPhysicalCardEngraveName ?? true
  );
  const engraveUsername = usePreferences(
    (state) => state.presentPhysicalCardEngraveUsername ?? true
  );
  const engraveQr = usePreferences(
    (state) => state.presentPhysicalCardEngraveQr ?? true
  );
  const setPreference = usePreferences((state) => state.set);

  return (
    <ModalSheet
      visible={visible}
      onRequestClose={onClose}>
      <View className="flex-1 bg-pageBg" style={{ paddingTop: sheetTopInset(insets.top) }}>
        <SheetHeader title={t('present.physicalCard.title')} canGoBack={false} onClose={onClose} />
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 20,
            paddingBottom: 24,
            gap: 22,
          }}
        >
          {/* The card as it would be cut: material and engraving update live. */}
          <CardPreview
            material={material}
            name={engraveName ? name : null}
            address={engraveUsername ? address : null}
            qr={engraveQr}
          />

          <View style={{ gap: 10 }}>
            <ThemedText variant="label" tone="secondary">
              {t('present.physicalCard.material')}
            </ThemedText>
            {/* Two by two: four labels never fit one row in English. */}
            <View className="flex-row flex-wrap" style={{ rowGap: 8, columnGap: 8 }}>
              {CARD_FINISHES.map((option) => (
                <View key={option} style={{ width: '48.5%' }}>
                  <MaterialOption
                    material={option}
                    label={t(`present.physicalCard.material.${option}`)}
                    selected={material === option}
                    onPress={() => {
                      setPreference('presentPhysicalCardMaterial', option);
                    }}
                  />
                </View>
              ))}
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <ThemedText variant="label" tone="secondary">
              {t('present.physicalCard.engraving')}
            </ThemedText>
            <ThemedSurface variant="inset" style={{ paddingHorizontal: 16 }}>
              <EngravingToggle
                label={t('present.physicalCard.engraveName')}
                value={engraveName}
                onValueChange={(value) => {
                  setPreference('presentPhysicalCardEngraveName', value);
                }}
              />
              <View style={{ height: 1, backgroundColor: colors.divider }} />
              <EngravingToggle
                label={t('present.physicalCard.engraveUsername')}
                value={engraveUsername}
                onValueChange={(value) => {
                  setPreference('presentPhysicalCardEngraveUsername', value);
                }}
              />
              <View style={{ height: 1, backgroundColor: colors.divider }} />
              <EngravingToggle
                label={t('present.physicalCard.engraveQr')}
                value={engraveQr}
                onValueChange={(value) => {
                  setPreference('presentPhysicalCardEngraveQr', value);
                }}
              />
            </ThemedSurface>
          </View>
        </ScrollView>

        <View
          className="bg-pageBg px-4 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <ThemedButton
            fullWidth
            disabled
            label={t('present.physicalCard.comingSoon')}
          />
        </View>
      </View>
    </ModalSheet>
  );
}

/** `.metal` proportions, painted in the chosen finish — the same finish the
 *  Present card wears. The QR corner is a position mark (an icon), not a
 *  code — the real one is cut at order time. */
function CardPreview({
  material,
  name,
  address,
  qr,
}: {
  readonly material: PhysicalCardMaterial;
  readonly name: string | null;
  readonly address: string | null;
  readonly qr: boolean;
}): ReactNode {
  const palette = finishPalette(material);
  return (
    <View
      style={{
        alignSelf: 'center',
        width: '82%',
        aspectRatio: 1.586,
        borderRadius: Radius.card,
        shadowColor: Colors.text1,
        shadowOpacity: 0.18,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 6,
      }}>
      <View
        style={{
          flex: 1,
          borderRadius: Radius.card,
          borderWidth: 1,
          borderColor: palette.faceBorder,
          overflow: 'hidden',
        }}>
        <CardFaceBackground finish={material} side="front" style={{ padding: 16, justifyContent: 'space-between' }}>
          <View>
            {name !== null ? (
              <ThemedText variant="titleMedium" numberOfLines={1} style={palette.ink}>
                {name}
              </ThemedText>
            ) : null}
            {address !== null ? (
              <ThemedText variant="caption" numberOfLines={1} ellipsizeMode="middle" style={{ ...palette.ink, opacity: 0.82 }}>
                {address}
              </ThemedText>
            ) : null}
          </View>
          <View className="flex-row items-end justify-between">
            <View style={{ opacity: 0.7 }}>
              <CredsMark size={20} ink={palette.markInk} accent={palette.markAccent} />
            </View>
            {qr ? (
              <View style={{ opacity: 0.85 }}>
                <SfIcon name="qrcode" size={34} color={palette.ink.color} />
              </View>
            ) : null}
          </View>
        </CardFaceBackground>
      </View>
    </View>
  );
}

function MaterialOption({
  material,
  label,
  selected,
  onPress,
}: {
  readonly material: PhysicalCardMaterial;
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const colors = useThemeColors();
  return (
    <PressableScale
      haptic="tap"
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
    >
      <ThemedSurface
        variant="outlined"
        className="flex-row items-center justify-center"
        style={{
          minHeight: 44,
          paddingHorizontal: 8,
          gap: 8,
          borderColor: selected ? colors.primaryBlue : colors.divider,
          borderWidth: selected ? 2 : 1,
          backgroundColor: selected ? colors.chipSurface : colors.cardBg,
        }}
      >
        <LinearGradient
          colors={finishSwatch(material)}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ width: 16, height: 16, borderRadius: Radius.pill }}
        />
        <ThemedText variant="label" numberOfLines={1}>
          {label}
        </ThemedText>
      </ThemedSurface>
    </PressableScale>
  );
}

function EngravingToggle({
  label,
  value,
  onValueChange,
}: {
  readonly label: string;
  readonly value: boolean;
  readonly onValueChange: (value: boolean) => void;
}): ReactNode {
  return (
    <View className="flex-row items-center" style={{ minHeight: 52, gap: 12 }}>
      <ThemedText variant="bodyMedium" style={{ flex: 1 }}>
        {label}
      </ThemedText>
      {/* RN's iOS Switch defaults to alignSelf 'flex-start', which beats the
          row's items-center and pins it to the top of a 52-pt row. */}
      <ThemedSwitch accessibilityLabel={label} value={value} onValueChange={onValueChange} />
    </View>
  );
}
