/**
 * PersonRow — one row in the People A–Z list, the same for a saved Page, a
 * manual contact, or both merged. The source gets no badge or tint: a Page
 * person shows its checked `@name`, a manual contact its company, and the
 * detail screen says where each piece came from.
 *
 * An imported link page (unsigned) still says 「未驗證」 in its second line
 * (CLAUDE.md rule 8 — an unverified claim never looks verified).
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { BrandIcon } from '@/components/icons/BrandIcon';
import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { contactSourceDescription } from '@/components/people/contactSource';
import { PageAvatar } from '@/components/people/PageAvatar';
import { ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { Radius } from '@/constants/radius';
import { haptic } from '@/feedback/haptics';
import { useTranslation } from '@/i18n';
import type { Person } from '@/people/person';
import { linkDisplay } from '@/profile/linkPresentation';

const AVATAR = 40;

export interface PersonRowProps {
  readonly person: Person;
  readonly selectionMode: boolean;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly onLongPress: () => void;
}

export function PersonRow({ person, selectionMode, selected, onPress, onLongPress }: PersonRowProps): ReactNode {
  const subtitle = usePersonSubtitle(person);
  return (
    <PressableScale
        onPress={onPress}
        onLongPress={() => {
          haptic('heavy');
          onLongPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${person.name}, ${subtitle}` : person.name}
        accessibilityState={selectionMode ? { selected } : undefined}
        className="flex-row items-center gap-3"
        style={{ minHeight: 60, paddingVertical: 10 }}
      >
        {selectionMode ? <SelectionCheck selected={selected} /> : null}
        <PersonAvatar person={person} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <ThemedText variant="bodyLarge" numberOfLines={1}>
            {person.name}
          </ThemedText>
          {subtitle ? (
            <ThemedText variant="bodySmall" tone="secondary" numberOfLines={1}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
        {!selectionMode ? (
          <SfIcon name="chevron.right" size={12} weight="semibold" color={Colors.text3} />
        ) : null}
        {/* Hairline under the text only, iOS-list style. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: (selectionMode ? 34 : 0) + AVATAR + 12,
            right: 0,
            bottom: 0,
            borderBottomWidth: 0.5,
            borderBottomColor: Colors.divider,
          }}
        />
      </PressableScale>
  );
}

function PersonAvatar({ person }: { readonly person: Person }): ReactNode {
  if (person.declared) {
    return (
      <View
        className="items-center justify-center overflow-hidden rounded-full bg-searchBg"
        style={{ width: AVATAR, height: AVATAR }}
      >
        <BrandIcon name={linkDisplay('', person.declared.sourceUrl).brand} size={20} color={Colors.text2} />
      </View>
    );
  }
  return <PageAvatar avatar={person.page?.record.avatar ?? null} displayName={person.name} size={AVATAR} />;
}

/** `@name` for a Page person, else what the user knows them by (company,
 *  title), else how a card-exchange contact arrived. Never a timestamp. */
function usePersonSubtitle(person: Person): string | undefined {
  const { t } = useTranslation();
  if (person.declared) {
    return `${linkDisplay('', person.declared.sourceUrl).text} · ${t('peopleList.declaredBadge')}`;
  }
  if (person.username !== null) return `@${person.username}`;
  const contact = person.contact;
  if (!contact) return undefined;
  const work = [contact.title, contact.company].filter((v): v is string => !!v && v.trim().length > 0);
  if (work.length > 0) return work.join(' · ');
  return contact.source === 'Manual' || person.page ? undefined : contactSourceDescription(contact, t);
}

/** The round multi-select check. */
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
