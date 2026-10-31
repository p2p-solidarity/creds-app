import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { ModalSheet, sheetTopInset } from '@/components/common/ModalSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { SheetHeader } from '@/components/me/AddLinkSheet';
import { ThemedButton, ThemedSurface, ThemedText } from '@/components/themed';
import { CardMetalColors, Colors } from '@/constants/Colors';
import { useThemeColors } from '@/constants/useThemeColors';
import { Radius } from '@/constants/radius';
import { useTranslation } from '@/i18n';
import type { PhysicalCardMaterial } from '@/present/presentModel';
import { usePreferences } from '@/settings/preferences';

const MATERIALS = ['steel', 'blackTitanium', 'brass'] as const satisfies readonly PhysicalCardMaterial[];

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
  const material = usePreferences(
    (state) => state.presentPhysicalCardMaterial ?? 'steel'
  );
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
            <View className="flex-row" style={{ gap: 8 }}>
              {MATERIALS.map((option) => (
                <MaterialOption
                  key={option}
                  material={option}
                  label={t(`present.physicalCard.material.${option}`)}
                  selected={material === option}
                  onPress={() => {
                    setPreference('presentPhysicalCardMaterial', option);
                  }}
                />
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

/** `.metal` proportions, painted in the chosen material. The QR corner is a
 *  position mark (an icon), not a code — the real one is cut at order time. */
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
      <LinearGradient
        colors={materialGradient(material)}
        start={{ x: 0, y: 0.3 }}
        end={{ x: 1, y: 0.7 }}
        style={{
          flex: 1,
          borderRadius: Radius.card,
          borderWidth: 1,
          borderColor: CardMetalColors.faceBorder,
          padding: 16,
          justifyContent: 'space-between',
        }}>
        <View>
          {name !== null ? (
            <ThemedText variant="titleMedium" numberOfLines={1} style={ETCH}>
              {name}
            </ThemedText>
          ) : null}
          {address !== null ? (
            <ThemedText variant="caption" numberOfLines={1} ellipsizeMode="middle" style={{ ...ETCH, opacity: 0.82 }}>
              {address}
            </ThemedText>
          ) : null}
        </View>
        <View className="flex-row items-end justify-between">
          <View style={{ opacity: 0.55 }}>
            <SfIcon name="wave.3.right" size={14} color={CardMetalColors.etch} />
          </View>
          {qr ? (
            <View style={{ opacity: 0.85 }}>
              <SfIcon name="qrcode" size={34} color={CardMetalColors.etch} />
            </View>
          ) : null}
        </View>
      </LinearGradient>
    </View>
  );
}

const ETCH = {
  color: CardMetalColors.etch,
  textShadowColor: CardMetalColors.etchShadow,
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 0,
} as const;

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
      fill
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
          colors={materialGradient(material)}
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
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center" style={{ minHeight: 52, gap: 12 }}>
      <ThemedText variant="bodyMedium" style={{ flex: 1 }}>
        {label}
      </ThemedText>
      {/* RN's iOS Switch defaults to alignSelf 'flex-start', which beats the
          row's items-center and pins it to the top of a 52-pt row. */}
      <Switch
        style={{ alignSelf: 'center' }}
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.divider, true: colors.primaryMauve }}
        thumbColor={colors.cardBg}
      />
    </View>
  );
}

function materialGradient(
  material: PhysicalCardMaterial
): readonly [string, string, string] {
  switch (material) {
    case 'steel':
      return [
        CardMetalColors.frontStops[0],
        CardMetalColors.frontStops[2],
        CardMetalColors.frontStops[7],
      ];
    case 'blackTitanium':
      return [Colors.pageNight, CardMetalColors.backStops[0], CardMetalColors.backStops[3]];
    case 'brass':
      return [Colors.warningText, Colors.cardDog, Colors.pageSunEnd];
  }
}
