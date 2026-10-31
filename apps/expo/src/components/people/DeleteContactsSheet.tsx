import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { ModalSheet, sheetTopInset } from '@/components/common/ModalSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedButton, ThemedSurface, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { useTranslation } from '@/i18n';

export interface DeleteContactsSheetProps {
  readonly visible: boolean;
  /** The selected people (contacts and saved Pages) by list key and name. */
  readonly names: readonly { readonly key: string; readonly name: string }[];
  readonly deleting: boolean;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

export function DeleteContactsSheet({
  visible,
  names,
  deleting,
  onConfirm,
  onClose,
}: DeleteContactsSheetProps): ReactNode {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <ModalSheet
      visible={visible}
      onRequestClose={() => {
        if (!deleting) onClose();
      }}>
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.pageBg,
          paddingTop: sheetTopInset(insets.top),
        }}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 24,
            gap: 16,
          }}
        >
          <ThemedText variant="titleLarge">
            {t('peopleList.deleteCountTitle', { count: names.length })}
          </ThemedText>

          <ThemedSurface variant="inset" padded>
            <View style={{ gap: 10 }}>
              <ThemedText variant="bodyMedium" tone="secondary">
                {t('peopleList.deleteCardsNotes')}
              </ThemedText>
              <ThemedText variant="bodyMedium" tone="secondary">
                {t('peopleList.deleteOthersUnaffected')}
              </ThemedText>
            </View>
          </ThemedSurface>

          <ThemedSurface variant="outlined">
            {names.map((contact, index) => (
              <View
                key={contact.key}
                className="flex-row items-center px-4"
                style={{
                  minHeight: 52,
                  borderBottomWidth: index === names.length - 1 ? 0 : 0.5,
                  borderBottomColor: Colors.divider,
                  gap: 12,
                }}
              >
                <View
                  className="items-center justify-center rounded-pill bg-searchBg"
                  style={{ width: 32, height: 32 }}
                >
                  <ThemedText variant="bodySmall" tone="secondary">
                    {initial(contact.name)}
                  </ThemedText>
                </View>
                <ThemedText variant="bodyLarge" numberOfLines={1} style={{ flex: 1 }}>
                  {contact.name}
                </ThemedText>
              </View>
            ))}
          </ThemedSurface>
        </ScrollView>

        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 12),
            gap: 10,
          }}
        >
          <ThemedButton
            fullWidth
            variant="destructive"
            label={t('peopleList.delete')}
            loading={deleting}
            disabled={names.length === 0}
            accessibilityHint={t('peopleList.deleteNoUndo')}
            onPress={onConfirm}
          />
          <ThemedButton
            fullWidth
            variant="secondary"
            label={t('peopleList.cancel')}
            disabled={deleting}
            onPress={onClose}
          />
        </View>
      </View>
    </ModalSheet>
  );
}

function initial(name: string): string {
  const trimmed = name.trim();
  return trimmed.length === 0 ? '?' : trimmed.charAt(0).toUpperCase();
}
