/**
 * 小 / 中 / 大 for a block's cards. Each option draws its own size as a small
 * card silhouette, so the choice reads before the label does; the live
 * preview above it repaints on every tap.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { ThemedText } from '@/components/themed';
import { Radius } from '@/constants/radius';
import { useThemeColors } from '@/constants/useThemeColors';
import { useTranslation } from '@/i18n';
import { PAGE_CARD_SIZES, type PageCardSize } from '@/page/pageDesign';

const BAR_HEIGHT: Readonly<Record<PageCardSize, number>> = { small: 6, medium: 10, large: 16 };

export function CardSizePicker({
  value,
  onChange,
}: {
  readonly value: PageCardSize;
  readonly onChange: (size: PageCardSize) => void;
}): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  return (
    <View className="gap-2">
      <ThemedText variant="label" tone="tertiary">{t('pageDesign.cardSize')}</ThemedText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {PAGE_CARD_SIZES.map((size) => {
          const selected = size === value;
          const tint = selected ? c.primaryBlue : c.text3;
          return (
            <PressableScale
              key={size}
              fill
              haptic="tap"
              onPress={() => { onChange(size); }}
              accessibilityRole="button"
              accessibilityLabel={t(`pageDesign.cardSize.${size}`)}
              accessibilityState={{ selected }}
              style={{
                flex: 1,
                minHeight: 64,
                paddingVertical: 10,
                gap: 8,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: Radius.field,
                borderWidth: selected ? 1.5 : 1,
                borderColor: selected ? c.primaryBlue : c.divider,
                backgroundColor: selected ? c.chipSurface : c.cardBg,
              }}>
              <View style={{ width: 40, height: 36, gap: 3, justifyContent: 'center' }}>
                <View style={{ height: BAR_HEIGHT[size], borderRadius: 3, backgroundColor: tint, opacity: 0.8 }} />
                <View style={{ height: BAR_HEIGHT[size], borderRadius: 3, backgroundColor: tint, opacity: 0.35 }} />
              </View>
              <ThemedText variant="bodySmall" style={{ color: selected ? c.primaryBlue : c.text1 }}>
                {t(`pageDesign.cardSize.${size}`)}
              </ThemedText>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}
