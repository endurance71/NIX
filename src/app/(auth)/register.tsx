import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInputRef } from '@expo/ui';
import { useAuth } from '../../hooks/useAuth';
import { useAuthRegisterCredentials } from '../../hooks/useAuthCredentials';
import {
  AuthErrorText,
  AuthFieldGroup,
  AuthFooterPrompt,
  AuthFormLayout,
  AuthSecureField,
  AuthTextField,
} from '../../components/ui/auth-form-layout';
import { AuthLabeledField } from '../../components/ui/auth-labeled-field';
import { AuthPrimaryButton } from '../../components/ui/auth-primary-button';

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
  const passwordRef = useRef<TextInputRef>(null);
  const confirmPasswordRef = useRef<TextInputRef>(null);

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
    <AuthFormLayout description={t('auth.registerDescription')}>
      <AuthFieldGroup labeled>
        <AuthLabeledField label={t('auth.emailLabel')}>
          <AuthTextField
            nativeValue={email}
            placeholder={t('auth.emailPlaceholder')}
            keyboardType="email-address"
            autoComplete="email"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            onChangeText={(text) => {
              onEmailChange(text);
              clearError();
            }}
            editable={!loading}
            testID="register-email"
          />
        </AuthLabeledField>
        <AuthLabeledField label={t('auth.passwordLabel')}>
          <AuthSecureField
            ref={passwordRef}
            nativeValue={password}
            placeholder={t('auth.passwordField')}
            autoComplete="new-password"
            returnKeyType="next"
            onSubmitEditing={() => confirmPasswordRef.current?.focus()}
            onChangeText={(text) => {
              onPasswordChange(text);
              clearError();
            }}
            editable={!loading}
            testID="register-password"
          />
        </AuthLabeledField>
        <AuthLabeledField label={t('auth.confirmPasswordField')}>
          <AuthSecureField
            ref={confirmPasswordRef}
            nativeValue={confirmPassword}
            placeholder={t('auth.confirmPasswordField')}
            autoComplete="new-password"
            returnKeyType="go"
            onSubmitEditing={() => void handleRegister()}
            onChangeText={(text) => {
              onConfirmPasswordChange(text);
              clearError();
            }}
            editable={!loading}
            testID="register-confirm-password"
          />
        </AuthLabeledField>
      </AuthFieldGroup>

      {error ? <AuthErrorText>{error}</AuthErrorText> : null}

      <AuthPrimaryButton
        label={t('auth.registerButton')}
        loading={loading}
        onPress={() => void handleRegister()}
        disabled={loading}
      />
      <AuthFooterPrompt
        prompt={t('auth.hasAccountPrompt')}
        linkLabel={t('auth.hasAccountLink')}
        onPress={() => router.replace('/(auth)/login')}
      />
    </AuthFormLayout>
  );
}
