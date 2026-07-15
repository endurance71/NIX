import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getCurrentLocale } from '../../../lib/i18n';
import { legalDocuments } from '../../../lib/legalDocuments';
import {
  NativeSettingsEmptyRow,
  NativeSettingsRow,
  NativeSettingsSection,
} from '../../../components/ui/native-settings';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';

export default function PrivacyPolicyScreen() {
  const { t } = useTranslation();
  const document = legalDocuments[getCurrentLocale()].privacy;

  return (
    <>
      <SettingsListScreen>
        <NativeSettingsSection title={`${t('profile.privacyPolicy')} · ${document.version}`}>
          <NativeSettingsEmptyRow text={document.effectiveDate} />
        </NativeSettingsSection>
        {document.sections.map((section) => (
          <NativeSettingsSection key={section.title} title={section.title}>
            <NativeSettingsEmptyRow text={section.body} />
          </NativeSettingsSection>
        ))}
        <NativeSettingsSection>
          <NativeSettingsRow
            title={t('profile.deleteAccount')}
            icon="trash"
            role="destructive"
            showsChevron
            onPress={() => router.push('/(tabs)/profile/delete-account')}
            testID="privacy-policy-delete-account"
          />
        </NativeSettingsSection>
      </SettingsListScreen>
      <Stack.Screen.Title>{t('profile.privacyPolicy')}</Stack.Screen.Title>
    </>
  );
}
