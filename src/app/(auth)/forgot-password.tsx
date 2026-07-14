import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useTrackedEmail } from '../../hooks/useAuthCredentials';
import {
  AuthErrorText,
  AuthFieldGroup,
  AuthFormLayout,
  AuthPrimaryButton,
  AuthTextField,
} from '../../components/ui/auth-form-layout';

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
    <AuthFormLayout variant="secondary" description={t('auth.forgotPasswordDescription')}>
      <AuthFieldGroup>
        <AuthTextField
          nativeValue={email}
          placeholder={t('auth.emailField')}
          keyboardType="email-address"
          autoComplete="email"
          returnKeyType="go"
          onSubmitEditing={() => void handleResetRequest()}
          onChangeText={(text) => {
            onEmailChange(text);
            clearError();
          }}
          editable={!loading}
          testID="forgot-password-email"
        />
      </AuthFieldGroup>

      {error ? <AuthErrorText>{error}</AuthErrorText> : null}

      <AuthPrimaryButton
        label={t('auth.forgotPasswordSubmit')}
        loading={loading}
        onPress={() => void handleResetRequest()}
        disabled={loading}
      />
    </AuthFormLayout>
  );
}
