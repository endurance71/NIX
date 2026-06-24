import { router } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { FieldGroup } from '@expo/ui';
import { useAuth } from '../../hooks/useAuth';
import { useTrackedEmail } from '../../hooks/useAuthCredentials';
import {
  AuthErrorText,
  AuthFormLayout,
  AuthFormHeader,
  AuthFormFooter,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthTextField,
} from '../../components/ui/auth-form-layout';

export default function ForgotPasswordScreen() {
  const { requestPasswordReset } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const { email, onEmailChange, getTrimmedEmail } = useTrackedEmail();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contentWidth = Math.max(260, windowWidth - 56);

  const clearError = () => {
    setError(null);
  };

  const handleResetRequest = async () => {
    const cleanedEmail = getTrimmedEmail();
    if (!cleanedEmail) {
      setError('Podaj adres e-mail.');
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
    <AuthFormLayout>
      <FieldGroup.Section>
        <FieldGroup.SectionHeader>
          <AuthFormHeader
            title="Reset hasła"
            description="Wyślemy link do ustawienia nowego hasła."
          />
        </FieldGroup.SectionHeader>

        <AuthTextField
          nativeValue={email}
          placeholder="E-mail"
          keyboardType="email-address"
          autoComplete="email"
          onChangeText={(text) => {
            onEmailChange(text);
            clearError();
          }}
        />

        <FieldGroup.SectionFooter>
          <AuthFormFooter>
            {error ? <AuthErrorText>{error}</AuthErrorText> : null}

            <AuthPrimaryButton
              label={loading ? 'Wysyłanie...' : 'Wyślij link resetu'}
              onPress={() => void handleResetRequest()}
              disabled={loading}
              style={{ width: contentWidth }}
            />

            <AuthSecondaryButton
              label="Wróć do logowania"
              onPress={() => router.replace('/(auth)/login')}
              style={{ width: contentWidth }}
            />
          </AuthFormFooter>
        </FieldGroup.SectionFooter>
      </FieldGroup.Section>
    </AuthFormLayout>
  );
}
