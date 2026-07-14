import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInputRef } from '@expo/ui';
import {
  AuthErrorText,
  AuthFieldGroup,
  AuthFooterPrompt,
  AuthFormLayout,
  AuthPrimaryButton,
  AuthSecureField,
} from '../../components/ui/auth-form-layout';
import { useAuthPasswordPair } from '../../hooks/useAuthCredentials';
import { useAuth } from '../../hooks/useAuth';
import { runWithFinally } from '../../lib/runWithFinally';

function getResetPasswordErrorMessage(message: string, t: (key: string) => string) {
  if (message.includes('Password should be at least')) return t('auth.passwordMin');
  if (message.toLowerCase().includes('same password')) return t('auth.resetPasswordSameError');
  return message;
}

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { updatePassword } = useAuth();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const {
    password,
    confirmPassword,
    onPasswordChange,
    onConfirmPasswordChange,
    getPassword,
    getConfirmPassword,
  } = useAuthPasswordPair();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmPasswordRef = useRef<TextInputRef>(null);
  const showLoginFallback = source === 'deeplink';

  const clearError = () => {
    setError(null);
  };

  const handleReset = async () => {
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

    setLoading(true);
    await runWithFinally(
      async () => {
        const { error: updateError } = await updatePassword(passwordValue);
        if (updateError) {
          setError(getResetPasswordErrorMessage(updateError.message, t));
          return;
        }
        router.replace('/(auth)/login');
      },
      () => setLoading(false)
    );
  };

  return (
    <AuthFormLayout variant="secondary" description={t('auth.resetPasswordDescription')}>
      <AuthFieldGroup>
        <AuthSecureField
          nativeValue={password}
          placeholder={t('auth.resetPasswordField')}
          autoComplete="new-password"
          returnKeyType="next"
          onSubmitEditing={() => confirmPasswordRef.current?.focus()}
          onChangeText={(text) => {
            onPasswordChange(text);
            clearError();
          }}
          editable={!loading}
          testID="reset-password"
        />
        <AuthSecureField
          ref={confirmPasswordRef}
          nativeValue={confirmPassword}
          placeholder={t('auth.resetPasswordConfirmField')}
          autoComplete="new-password"
          returnKeyType="go"
          onSubmitEditing={() => void handleReset()}
          onChangeText={(text) => {
            onConfirmPasswordChange(text);
            clearError();
          }}
          editable={!loading}
          testID="reset-password-confirm"
        />
      </AuthFieldGroup>

      {error ? <AuthErrorText>{error}</AuthErrorText> : null}

      <AuthPrimaryButton
        label={t('auth.resetPasswordSubmit')}
        loading={loading}
        onPress={() => void handleReset()}
        disabled={loading}
      />
      {showLoginFallback ? (
        <AuthFooterPrompt
          linkLabel={t('auth.forgotPasswordBack')}
          onPress={() => router.replace('/(auth)/login')}
        />
      ) : null}
    </AuthFormLayout>
  );
}
