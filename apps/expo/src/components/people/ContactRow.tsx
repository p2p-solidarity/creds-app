import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { PageAvatar } from '@/components/people/PageAvatar';
import { ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { Radius } from '@/constants/radius';
import type { ContactManifestEntry } from '@/contacts/repository';
import { haptic } from '@/feedback/haptics';
import { useTranslation } from '@/i18n';

type Translate = ReturnType<typeof useTranslation>['t'];

export interface ContactRowProps {
  readonly contact: ContactManifestEntry;
  readonly selectionMode?: boolean;
  readonly selected?: boolean;
  readonly onPress?: () => void;
  readonly onLongPress?: () => void;
}

export function ContactRow({
  contact,
  selectionMode = false,
  selected = false,
  onPress,
  onLongPress,
}: ContactRowProps): ReactNode {
  const { t } = useTranslation();
  const source = contactSourceDescription(contact, t);

  return (
    <PressableScale
      onPress={onPress}
      onLongPress={() => {
        haptic('heavy');
        onLongPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={contact.name}
      accessibilityState={selectionMode ? { selected } : undefined}
      className="flex-row items-center gap-3 py-3"
    >
      {selectionMode ? <SelectionCheck selected={selected} /> : null}

      <PageAvatar avatar={null} displayName={contact.name} size={38} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <ThemedText variant="bodyLarge" numberOfLines={1}>
          {contact.name}
        </ThemedText>
        {source ? (
          <ThemedText variant="caption" tone="tertiary" numberOfLines={1}>
            {source}
          </ThemedText>
        ) : null}
      </View>

      {!selectionMode ? (
        <SfIcon name="chevron.right" size={12} weight="semibold" color={Colors.text3} />
      ) : null}
    </PressableScale>
  );
}

/** The round multi-select check shared by contact and saved-Page rows. */
export function SelectionCheck({ selected }: { readonly selected: boolean }): ReactNode {
  return (
    <View style={{ width: 22 }}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: Radius.pill,
          borderWidth: 1.5,
          borderColor: selected ? Colors.primaryBlue : Colors.text3,
          backgroundColor: selected ? Colors.primaryBlue : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? (
          <SfIcon name="checkmark" size={12} weight="bold" color={Colors.invertedButtonText} />
        ) : null}
      </View>
    </View>
  );
}

/** Source copy is rendered only from persisted manifest fields (never mock context). */
export function contactSourceDescription(
  contact: Pick<ContactManifestEntry, 'source' | 'tags'>,
  t: Translate,
): string | undefined {
  if (contact.source === 'Manual') return t('peopleList.sourceManual');
  const source = contactSourceTag(contact, t);
  return source ? t('peopleList.sourceCard', { source }) : undefined;
}

export function contactSourceTag(
  contact: Pick<ContactManifestEntry, 'source' | 'tags'>,
  t: Translate,
): string | undefined {
  if (contact.source === 'Manual') return t('peopleList.sourceManual');
  return contact.tags
    .map((tag) => tag.trim())
    .find((tag) => tag.length > 0) ?? sourceName(contact.source, t);
}

export function sourceName(
  source: ContactManifestEntry['source'],
  t: Translate,
): string | undefined {
  switch (source) {
    case 'QR Code':
      return t('peopleList.sourceQr');
    case 'Proximity':
      return t('peopleList.sourceProximity');
    case 'App Clip':
      return t('peopleList.sourceAppClip');
    case 'AirDrop':
      return t('peopleList.sourceAirDrop');
    case 'Manual':
      return t('peopleList.sourceManual');
  }
}
