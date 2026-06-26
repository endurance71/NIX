import { router, useLocalSearchParams } from 'expo-router';
import { FieldGroup } from '@expo/ui';
import { useTranslation } from 'react-i18next';
import {
  AuthActionsSection,
  AuthFooterPrompt,
  AuthFormHeader,
  AuthFormLayout,
  AuthPrimaryButton,
} from '../../components/ui/auth-form-layout';
import { AuthRnBridge } from '../../components/ui/auth-rn-bridge';

export default function CheckEmailScreen() {
  const { t } = useTranslation();
  const { email, mode } = useLocalSearchParams<{ email?: string; mode?: 'signup' | 'recovery' }>();
  const isRecovery = mode === 'recovery';
  const emailLabel = email ?? t('auth.emailPlaceholder');

  const title = isRecovery ? t('auth.checkEmailRecoveryTitle') : t('auth.checkEmailSignupTitle');
  const description = isRecovery
    ? t('auth.checkEmailRecoveryBody', { email: emailLabel })
    : t('auth.checkEmailSignupBody', { email: emailLabel });

  return (
    <AuthFormLayout>
      <FieldGroup.Section>
        <FieldGroup.SectionHeader>
          <AuthFormHeader title={title} description={description} />
        </FieldGroup.SectionHeader>
      </FieldGroup.Section>

      <FieldGroup.Section>
        <AuthActionsSection>
          <AuthPrimaryButton
            label={t('auth.checkEmailBackToLogin')}
            onPress={() => router.replace('/(auth)/login')}
          />
        </AuthActionsSection>
        <FieldGroup.SectionFooter>
          <AuthRnBridge>
            <AuthFooterPrompt
              prompt={t('auth.checkEmailNoAccountPrompt')}
              linkLabel={t('auth.checkEmailNoAccountLink')}
              onPress={() => router.replace('/(auth)/register')}
            />
          </AuthRnBridge>
        </FieldGroup.SectionFooter>
      </FieldGroup.Section>
    </AuthFormLayout>
  );
}
