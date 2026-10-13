import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInputRef } from '@expo/ui';
import {
  AuthErrorText,
  AuthFieldGroup,
  AuthFooterPrompt,
  AuthFormLayout,
  AuthSecureField,
} from '../../components/ui/auth-form-layout';
import { AuthLabeledField } from '../../components/ui/auth-labeled-field';
import { AuthPrimaryButton } from '../../components/ui/auth-primary-button';
import { useAuthPasswordPair } from '../../hooks/useAuthCredentials';
import { useAuth } from '../../hooks/useAuth';
import { runWithFinally } from '../../lib/runWithFinally';
import { notify } from '../../lib/haptics';
import { notifySuccess } from '../../lib/appNotify';
import { getPasswordUpdateErrorKey } from '../../lib/passwordUpdateError';

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
  const [passwordsShown, setPasswordsShown] = useState(false);
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
          setError(t(getPasswordUpdateErrorKey(updateError)));
          notify('error');
          return;
        }
        // The recovery session stays signed in, so go straight to the app instead of flashing the
        // login screen before the bootstrap gate redirects.
        notifySuccess(t('profile.passwordChanged'));
        router.replace('/(tabs)');
      },
      () => setLoading(false)
    );
  };

  return (
    <AuthFormLayout description={t('auth.resetPasswordDescription')}>
      <AuthFieldGroup labeled>
        <AuthLabeledField label={t('auth.passwordLabel')}>
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
            revealed={passwordsShown}
            revealToggle={{
              revealed: passwordsShown,
              onToggle: () => setPasswordsShown((value) => !value),
              showLabel: t('auth.showPassword'),
              hideLabel: t('auth.hidePassword'),
            }}
          />
        </AuthLabeledField>
        <AuthLabeledField label={t('auth.resetPasswordConfirmField')}>
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
            revealed={passwordsShown}
          />
        </AuthLabeledField>
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
          onPress={() => router.dismissTo('/(auth)/login')}
        />
      ) : null}
    </AuthFormLayout>
  );
}
