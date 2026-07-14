import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { NativeSettingsEmptyRow, NativeSettingsSection } from '../../../components/ui/native-settings';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';

export default function PrivacyPolicyScreen() {
  const { t } = useTranslation();

  return (
    <>
      <SettingsListScreen>
        <NativeSettingsSection title={t('profile.privacyPolicyDataTitle')}>
          <NativeSettingsEmptyRow text={t('profile.privacyPolicyDataBody')} />
        </NativeSettingsSection>
        <NativeSettingsSection title={t('profile.privacyPolicyMediaTitle')}>
          <NativeSettingsEmptyRow text={t('profile.privacyPolicyMediaBody')} />
        </NativeSettingsSection>
        <NativeSettingsSection title={t('profile.privacyPolicySocialTitle')}>
          <NativeSettingsEmptyRow text={t('profile.privacyPolicySocialBody')} />
        </NativeSettingsSection>
        <NativeSettingsSection title={t('profile.privacyPolicySecurityTitle')}>
          <NativeSettingsEmptyRow text={t('profile.privacyPolicySecurityBody')} />
        </NativeSettingsSection>
        <NativeSettingsSection title={t('profile.privacyPolicyContactTitle')}>
          <NativeSettingsEmptyRow text={t('profile.privacyPolicyContactBody')} />
        </NativeSettingsSection>
      </SettingsListScreen>
      <Stack.Screen.Title>{t('profile.privacyPolicy')}</Stack.Screen.Title>
    </>
  );
}
