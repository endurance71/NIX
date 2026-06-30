import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useAuthRegisterCredentials } from '../../hooks/useAuthCredentials';
import {
  AuthActionsSection,
  AuthFooterPrompt,
  AuthFormHeader,
  AuthFormLayout,
  AuthPrimaryButton,
  AuthSecureField,
  AuthTextField,
  FieldGroup,
} from '../../components/ui/auth-form-layout';
import { AuthRnBridge } from '../../components/ui/auth-rn-bridge';
import { AuthBrandBlock } from '../../components/auth/AuthBrandBlock';

function isEmailValid(email: string) {
  return /\S+@\S+\.\S+/.test(email);
}

export default function RegisterScreen() {
  const { t } = useTranslation();
  const { signUp } = useAuth();
  const {
    email,
    password,
    confirmPassword,
    onEmailChange,
    onPasswordChange,
    onConfirmPasswordChange,
    getTrimmedEmail,
    getPassword,
    getConfirmPassword,
  } = useAuthRegisterCredentials();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => {
    setError(null);
  };

  const handleRegister = async () => {
    const cleanedEmail = getTrimmedEmail();
    const passwordValue = getPassword();
    const confirmPasswordValue = getConfirmPassword();

    if (!isEmailValid(cleanedEmail)) {
      setError(t('auth.invalidEmail'));
      return;
    }
    if (passwordValue.length < 8) {
      setError(t('auth.passwordMin'));
      return;
    }
    if (passwordValue !== confirmPasswordValue) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setLoading(true);
    setError(null);
    const { error: signUpError } = await signUp(cleanedEmail, passwordValue);
    setLoading(false);

    if (signUpError) {
      if (signUpError.message.includes('User already registered')) {
        setError(t('auth.accountExists'));
      } else if (signUpError.message.includes('Password should be at least')) {
        setError(t('auth.passwordMin'));
      } else {
        setError(signUpError.message);
      }
      return;
    }

    router.replace({ pathname: '/(auth)/check-email', params: { email: cleanedEmail, mode: 'signup' } });
  };

  return (
    <AuthFormLayout contentVerticalAlignment="center" header={<AuthBrandBlock size="large" />}>
      <FieldGroup.Section>
        <FieldGroup.SectionHeader>
          <AuthFormHeader
            title={t('auth.registerHeader')}
            description={t('auth.registerDescription')}
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
        <AuthSecureField
          nativeValue={password}
          placeholder={t('auth.passwordField')}
          autoComplete="new-password"
          onChangeText={(text) => {
            onPasswordChange(text);
            clearError();
          }}
        />
        <AuthSecureField
          nativeValue={confirmPassword}
          placeholder={t('auth.confirmPasswordField')}
          autoComplete="new-password"
          onChangeText={(text) => {
            onConfirmPasswordChange(text);
            clearError();
          }}
        />

        <AuthActionsSection error={error}>
          <AuthPrimaryButton
            label={loading ? t('auth.registerLoading') : t('auth.registerButton')}
            onPress={() => void handleRegister()}
            disabled={loading}
          />
        </AuthActionsSection>
        <FieldGroup.SectionFooter>
          <AuthRnBridge>
            <AuthFooterPrompt
              prompt={t('auth.hasAccountPrompt')}
              linkLabel={t('auth.hasAccountLink')}
              onPress={() => router.replace('/(auth)/login')}
            />
          </AuthRnBridge>
        </FieldGroup.SectionFooter>
      </FieldGroup.Section>
    </AuthFormLayout>
  );
}
