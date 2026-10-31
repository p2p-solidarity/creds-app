/**
 * VCF import, laid out like the other settings sub-pages.
 * Pick a .vcf file → parse → insert each contact.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { safeBack } from '@/navigation/safeBack';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { importFromVcf } from '@/contacts/importer';
import { SettingsBlockSection, SettingsScreenTitle } from '@/components/settings/SettingsBlocks';
import { ThemedButton, ThemedText } from '@/components/themed';
import { useTranslation } from '@/i18n';
import { pushToast } from '@/feedback/toast';

export default function ImportVcf() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [lastImport, setLastImport] = useState<number | null>(null);

  const onPick = async () => {
    setBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/vcard', 'text/x-vcard', 'text/directory', 'public.vcard'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const asset = res.assets[0];
      if (!asset) return;
      const text = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const inserted = await importFromVcf(text);
      setLastImport(inserted);
      pushToast(t('contactVcf.importedToast', { count: inserted }), 'success');
    } catch (err) {
      pushToast(t('contactVcf.importFailed', { message: String((err as Error).message) }), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-pageBg" style={{ paddingTop: insets.top }}>
      <SettingsScreenTitle
        title={t('contactVcf.title')}
        leadingAction={{ accessibilityLabel: t('common.back'), onPress: () => { safeBack(); } }}
      />
      <ScrollView contentContainerStyle={{ paddingTop: 24, paddingBottom: 24 + insets.bottom }}>
        <View className="gap-6">
          <SettingsBlockSection index={0} title={t('contactVcf.extractHeader')} footer={t('contactVcf.subtitle')}>
            <View className="px-4 py-3">
              <ThemedText variant="bodyMedium">
                {t('contactVcf.extractFullName')}{'\n'}
                {t('contactVcf.extractEmailPhone')}{'\n'}
                {t('contactVcf.extractOrgTitle')}{'\n'}
                {t('contactVcf.extractPhoto')}
              </ThemedText>
            </View>
          </SettingsBlockSection>

          {lastImport !== null ? (
            <SettingsBlockSection index={1} title={t('contactVcf.lastImportHeader')}>
              <View className="px-4 py-3">
                <ThemedText variant="bodyLarge" tabularNums>{t('contactVcf.lastImportCount', { count: lastImport })}</ThemedText>
              </View>
            </SettingsBlockSection>
          ) : null}

          <View className="px-4">
            <ThemedButton
              label={busy ? t('contactVcf.importing') : t('contactVcf.pickFile')}
              fullWidth
              loading={busy}
              onPress={() => { void onPick(); }}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
