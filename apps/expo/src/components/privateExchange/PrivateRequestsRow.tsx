/**
 * People-tab entry to the private inbox (docs/ref/16 §4). Syncs on focus;
 * shows a row only when there is something waiting for the user.
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedSurface, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { Radius } from '@/constants/radius';
import { useTranslation } from '@/i18n';

import { usePendingIncoming, usePrivateInboxSync, useUnsavedContactShares } from './usePrivateExchange';

export function PrivateRequestsRow(): ReactNode {
  const { t } = useTranslation();
  usePrivateInboxSync();
  const pending = usePendingIncoming();
  const shares = useUnsavedContactShares();
  const count = pending.length + shares.length;
  if (count === 0) return null;

  return (
    <View className="px-4 pb-3">
      <ThemedSurface
        variant="card"
        style={{
          borderRadius: Radius.group,
          borderWidth: 0.5,
          borderColor: Colors.primaryBlue,
          backgroundColor: Colors.chipSurface,
        }}
      >
        <PressableScale
          onPress={() => { router.push('/inbox'); }}
          accessibilityRole="button"
          accessibilityLabel={t('privateExchange.inbox.row', { count })}
          style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}
        >
          <SfIcon name="lock" size={18} color={Colors.primaryBlue} />
          <ThemedText variant="bodyMedium" tabularNums style={{ flex: 1 }}>
            {t('privateExchange.inbox.row', { count })}
          </ThemedText>
          <SfIcon name="chevron.right" size={12} color={Colors.text2} />
        </PressableScale>
      </ThemedSurface>
    </View>
  );
}
