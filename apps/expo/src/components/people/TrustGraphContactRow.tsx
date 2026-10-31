import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Colors } from '@/constants/Colors';

import { ContactRow, type ContactRowProps } from './ContactRow';

/**
 * Compatibility name for the manifest-backed contact row: initial avatar,
 * name, real source context, selection state, and a chevron — the same
 * layout as a saved Page row, so both kinds read as one list.
 */
export type TrustGraphContactRowProps = ContactRowProps;

export function TrustGraphContactRow(props: TrustGraphContactRowProps): ReactNode {
  return (
    <View
      style={{
        borderBottomWidth: 0.5,
        borderBottomColor: Colors.divider,
      }}
    >
      <ContactRow {...props} />
    </View>
  );
}
