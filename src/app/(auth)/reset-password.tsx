import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AuthActionsSection,
  AuthFooterPrompt,
  AuthFormHeader,
  AuthFormLayout,
  AuthPrimaryButton,
  AuthSecureField,
  FieldGroup,
} from '../../components/ui/auth-form-layout';
import { AuthRnBridge } from '../../components/ui/auth-rn-bridge';
import { useAuthPasswordPair } from '../../hooks/useAuthCredentials';
import { AuthBrandBlock } from '../../components/auth/AuthBrandBlock';

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const {
    password,
    confirmPassword,
    onPasswordChange,
    onConfirmPasswordChange,
    getPassword,
    getConfirmPassword,
  } = useAuthPasswordPair();
  const [error, setError] = useState<string | null>(null);

  const clearError = () => {
    setError(null);
  };

  const handleReset = () => {
    const passwordValue = getPassword();
    const confirmPasswordValue = getConfirmPassword();

    setError(null);

    if (!passwordValue || !confirmPasswordValue) {
      setError(t('auth.allFieldsRequired'));
      return;
    }

    if (passwordValue.length < 8) {
      setError(t('auth.passwordMin'));
      return;
    }
    if (passwordValue !== confirmPasswordValue) {
      setError(t('auth.resetPasswordMismatch'));
      return;
    }
    router.replace('/(auth)/login');
  };

  return (
    <AuthFormLayout header={<AuthBrandBlock size="large" />}>
      <FieldGroup.Section>
        <FieldGroup.SectionHeader>
          <AuthFormHeader
            title={t('auth.resetPasswordHeader')}
            description={t('auth.resetPasswordDescription')}
          />
        </FieldGroup.SectionHeader>

        <AuthSecureField
          nativeValue={password}
          placeholder={t('auth.resetPasswordField')}
          autoComplete="new-password"
          onChangeText={(text) => {
            onPasswordChange(text);
            clearError();
          }}
        />
        <AuthSecureField
          nativeValue={confirmPassword}
          placeholder={t('auth.resetPasswordConfirmField')}
          autoComplete="new-password"
          onChangeText={(text) => {
            onConfirmPasswordChange(text);
            clearError();
          }}
        />

        <AuthActionsSection error={error}>
          <AuthPrimaryButton label={t('auth.resetPasswordSubmit')} onPress={handleReset} />
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
