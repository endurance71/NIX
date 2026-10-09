import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getCurrentLocale } from '../../lib/i18n';
import { legalDocuments } from '../../lib/legalDocuments';
import { useAppTheme } from '../../hooks/useAppTheme';
import { NativeSettingsEmptyRow, NativeSettingsSection } from './native-settings';
import { SettingsListScreen } from './settings-list-screen';

export function LegalDocumentScreen({ kind }: { kind: 'privacy' | 'terms' }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const document = legalDocuments[getCurrentLocale()][kind];
  const title = t(kind === 'privacy' ? 'profile.privacyPolicy' : 'profile.terms');
  return (
    <>
      <SettingsListScreen>
        <NativeSettingsSection title={`${title} · ${document.version}`}>
          <NativeSettingsEmptyRow text={document.effectiveDate} />
        </NativeSettingsSection>
        {document.sections.map((section) => (
          <NativeSettingsSection key={section.title} title={section.title}>
            <NativeSettingsEmptyRow text={section.body} />
          </NativeSettingsSection>
        ))}
      </SettingsListScreen>
      <Stack.Screen.Title style={{ color: colors.label }}>{title}</Stack.Screen.Title>
    </>
  );
}
