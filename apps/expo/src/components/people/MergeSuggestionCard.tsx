/**
 * Offers to merge a saved Page and a manual contact with the same full name.
 * Nothing merges until the user taps 合併; 不用 hides this pair for good.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ThemedButton, ThemedSurface, ThemedText } from '@/components/themed';
import { haptic } from '@/feedback/haptics';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import { useMergeDismissals, type MergeSuggestion } from '@/people/person';
import { useProfileSnapshotStore } from '@/people/profileSnapshots';

export function MergeSuggestionCard({ suggestion }: { readonly suggestion: MergeSuggestion }): ReactNode {
  const { t } = useTranslation();
  const linkContact = useProfileSnapshotStore((s) => s.linkContact);
  const dismiss = useMergeDismissals((s) => s.dismiss);

  return (
    <ThemedSurface variant="outlined" className="px-4 py-3" style={{ gap: 10 }}>
      <View style={{ gap: 2 }}>
        <ThemedText variant="bodyMedium">
          {t('peopleMerge.suggestTitle', { name: suggestion.page.record.displayName })}
        </ThemedText>
        <ThemedText variant="bodySmall" tone="secondary">
          {t('peopleMerge.suggestBody')}
        </ThemedText>
      </View>
      <View className="flex-row" style={{ gap: 8 }}>
        <ThemedButton
          size="sm"
          label={t('peopleMerge.merge')}
          haptic={false}
          onPress={() => {
            linkContact(suggestion.page.did, suggestion.contact.id);
            haptic('success');
            pushToast(t('peopleMerge.merged'), 'success', 2000);
          }}
        />
        <ThemedButton
          size="sm"
          variant="secondary"
          label={t('peopleMerge.notNow')}
          onPress={() => { dismiss(suggestion.key); }}
        />
      </View>
    </ThemedSurface>
  );
}
