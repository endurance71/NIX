import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getCurrentLocale } from '../../../lib/i18n';
import { legalDocuments } from '../../../lib/legalDocuments';
import { NativeSettingsEmptyRow, NativeSettingsSection } from '../../../components/ui/native-settings';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';

export default function TermsScreen() {
  const { t } = useTranslation();
  const document = legalDocuments[getCurrentLocale()].terms;

  return (
    <>
      <SettingsListScreen>
        <NativeSettingsSection title={`${t('profile.terms')} · ${document.version}`}>
          <NativeSettingsEmptyRow text={document.effectiveDate} />
        </NativeSettingsSection>
        {document.sections.map((section) => (
          <NativeSettingsSection key={section.title} title={section.title}>
            <NativeSettingsEmptyRow text={section.body} />
          </NativeSettingsSection>
        ))}
      </SettingsListScreen>
      <Stack.Screen.Title>{t('profile.terms')}</Stack.Screen.Title>
    </>
  );
}
