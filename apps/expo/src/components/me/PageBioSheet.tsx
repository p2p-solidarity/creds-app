/**
 * PageBioSheet — edit the Page's bio from the Page tab itself (Linktree's
 * tap-the-bio), instead of the full Me › Edit form. Saving re-signs the Page
 * once, like adding a link.
 */
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalSheet, sheetTopInset } from '@/components/common/ModalSheet';
import { ThemedButton, ThemedText, ThemedTextInput } from '@/components/themed';
import { haptic } from '@/feedback/haptics';
import { pushToast } from '@/feedback/toast';
import { useTranslation } from '@/i18n';
import { saveBio } from '@/profile/quickAddLink';

import { SheetHeader } from './AddLinkSheet';

/** The visitor page's `.pub-bio` reads well up to about this; longer still saves. */
const BIO_SOFT_LIMIT = 160;
const BIO_MAX = 500;

export function PageBioSheet({
  visible,
  bio,
  onClose,
}: {
  readonly visible: boolean;
  readonly bio: string;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <ModalSheet visible={visible} onRequestClose={onClose}>
      {visible ? <BioEditor initial={bio} onClose={onClose} /> : null}
    </ModalSheet>
  );
}

function BioEditor({ initial, onClose }: { readonly initial: string; readonly onClose: () => void }): ReactNode {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const length = value.trim().length;

  const save = () => {
    setSaving(true);
    void saveBio(value).then((ok) => {
      setSaving(false);
      if (ok) {
        haptic('success');
        onClose();
        return;
      }
      pushToast(t('meEdit.saveFailed'), 'error');
    });
  };

  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: sheetTopInset(insets.top) }}>
      <SheetHeader title={t('pageBio.title')} canGoBack={false} onClose={onClose} />
      {/* A plain View, not KeyboardAwareScrollView: the input and Save sit at
          the top, above any keyboard, and on Android that ScrollView claimed
          the first tap with the keyboard up (it hid the keyboard, never saved). */}
      <View style={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 14 }}>
        <ThemedTextInput
          value={value}
          onChangeText={setValue}
          placeholder={t('meEdit.bioPlaceholder')}
          accessibilityLabel={t('meEdit.bio')}
          maxLength={BIO_MAX}
          multiline
          autoFocus
        />
        <ThemedText
          variant="caption"
          tone={length > BIO_SOFT_LIMIT ? 'secondary' : 'tertiary'}
          style={{ alignSelf: 'flex-end' }}>
          {length > BIO_SOFT_LIMIT ? t('pageBio.long', { count: length }) : `${String(length)} / ${String(BIO_SOFT_LIMIT)}`}
        </ThemedText>
        <ThemedButton
          label={t('common.save')}
          fullWidth
          loading={saving}
          disabled={value.trim() === initial.trim()}
          onPress={save}
        />
      </View>
    </View>
  );
}
