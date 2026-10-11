import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getCurrentLocale } from '../../lib/i18n';
import { legalDocuments } from '../../lib/legalDocuments';
import { keepLinksUnbroken } from '../../lib/unbreakableLinks';
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
        {/* The screen title already names the document; the date is shown once, in words. */}
        <NativeSettingsSection>
          <NativeSettingsEmptyRow text={t('profile.legalEffectiveFrom', { date: document.effectiveDate })} />
        </NativeSettingsSection>
        {document.sections.map((section) => (
          <NativeSettingsSection key={section.title} title={section.title}>
            <NativeSettingsEmptyRow text={keepLinksUnbroken(section.body)} />
          </NativeSettingsSection>
        ))}
      </SettingsListScreen>
      <Stack.Screen.Title style={{ color: colors.label }}>{title}</Stack.Screen.Title>
    </>
  );
}
