import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useTrackedEmail } from '../../hooks/useAuthCredentials';
import {
  AuthActionsSection,
  AuthFooterPrompt,
  AuthFormHeader,
  AuthFormLayout,
  AuthPrimaryButton,
  AuthTextField,
  FieldGroup,
} from '../../components/ui/auth-form-layout';
import { AuthRnBridge } from '../../components/ui/auth-rn-bridge';
import { AuthBrandBlock } from '../../components/auth/AuthBrandBlock';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const { requestPasswordReset } = useAuth();
  const { email, onEmailChange, getTrimmedEmail } = useTrackedEmail();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => {
    setError(null);
  };

  const handleResetRequest = async () => {
    const cleanedEmail = getTrimmedEmail();
    if (!cleanedEmail) {
      setError(t('auth.emailRequired'));
      return;
    }

    setLoading(true);
    setError(null);
    const { error: resetError } = await requestPasswordReset(cleanedEmail);
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    router.replace({ pathname: '/(auth)/check-email', params: { email: cleanedEmail, mode: 'recovery' } });
  };

  return (
    <AuthFormLayout header={<AuthBrandBlock size="large" />}>
      <FieldGroup.Section>
        <FieldGroup.SectionHeader>
          <AuthFormHeader
            title={t('auth.forgotPasswordHeader')}
            description={t('auth.forgotPasswordDescription')}
          />
        </FieldGroup.SectionHeader>

        <AuthTextField
          nativeValue={email}
          placeholder={t('auth.emailField')}
          keyboardType="email-address"
          autoComplete="email"
          onChangeText={(text) => {
            onEmailChange(text);
            clearError();
          }}
        />

        <AuthActionsSection error={error}>
          <AuthPrimaryButton
            label={loading ? t('auth.forgotPasswordLoading') : t('auth.forgotPasswordSubmit')}
            onPress={() => void handleResetRequest()}
            disabled={loading}
          />
        </AuthActionsSection>
        <FieldGroup.SectionFooter>
          <AuthRnBridge>
            <AuthFooterPrompt
              linkLabel={t('auth.forgotPasswordBack')}
              onPress={() => router.replace('/(auth)/login')}
            />
          </AuthRnBridge>
        </FieldGroup.SectionFooter>
      </FieldGroup.Section>
    </AuthFormLayout>
  );
}
