import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { NativeSettingsEmptyRow, NativeSettingsSection } from '../../../components/ui/native-settings';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';

export default function TermsScreen() {
  const { t } = useTranslation();

  return (
    <>
      <SettingsListScreen>
        <NativeSettingsSection title={t('profile.termsAccountTitle')}>
          <NativeSettingsEmptyRow text={t('profile.termsAccountBody')} />
        </NativeSettingsSection>
        <NativeSettingsSection title={t('profile.termsContentTitle')}>
          <NativeSettingsEmptyRow text={t('profile.termsContentBody')} />
        </NativeSettingsSection>
        <NativeSettingsSection title={t('profile.termsSafetyTitle')}>
          <NativeSettingsEmptyRow text={t('profile.termsSafetyBody')} />
        </NativeSettingsSection>
        <NativeSettingsSection title={t('profile.termsAvailabilityTitle')}>
          <NativeSettingsEmptyRow text={t('profile.termsAvailabilityBody')} />
        </NativeSettingsSection>
        <NativeSettingsSection title={t('profile.termsChangesTitle')}>
          <NativeSettingsEmptyRow text={t('profile.termsChangesBody')} />
        </NativeSettingsSection>
      </SettingsListScreen>
      <Stack.Screen.Title>{t('profile.terms')}</Stack.Screen.Title>
    </>
  );
}
