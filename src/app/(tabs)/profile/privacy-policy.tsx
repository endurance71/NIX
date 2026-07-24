import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getCurrentLocale } from '../../../lib/i18n';
import { legalDocuments } from '../../../lib/legalDocuments';
import {
  NativeSettingsEmptyRow,
  NativeSettingsSection,
} from '../../../components/ui/native-settings';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';
import { useAppTheme } from '../../../hooks/useAppTheme';

export default function PrivacyPolicyScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
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
      </SettingsListScreen>
      <Stack.Screen.Title style={{ color: colors.label }}>{t('profile.privacyPolicy')}</Stack.Screen.Title>
    </>
  );
}
