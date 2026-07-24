import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useTrackedEmail } from '../../hooks/useAuthCredentials';
import {
  AuthErrorText,
  AuthFieldGroup,
  AuthFormLayout,
  AuthTextField,
} from '../../components/ui/auth-form-layout';
import { AuthLabeledField } from '../../components/ui/auth-labeled-field';
import { AuthPrimaryButton } from '../../components/ui/auth-primary-button';
import { runWithFinally } from '../../lib/runWithFinally';

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
    await runWithFinally(
      async () => {
        try {
          const { error: resetError } = await requestPasswordReset(cleanedEmail);

          if (resetError) {
            setError(resetError.message);
          } else {
            router.replace({ pathname: '/(auth)/check-email', params: { email: cleanedEmail, mode: 'recovery' } });
          }
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      },
      () => setLoading(false)
    );
  };

  return (
    <AuthFormLayout description={t('auth.forgotPasswordDescription')}>
      <AuthFieldGroup labeled>
        <AuthLabeledField label={t('auth.emailLabel')}>
          <AuthTextField
            nativeValue={email}
            placeholder={t('auth.emailPlaceholder')}
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
        </AuthLabeledField>
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
