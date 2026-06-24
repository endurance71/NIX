import { router } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  AuthErrorText,
  AuthFormLayout,
  AuthFormSection,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthSecondaryText,
  AuthTextField,
} from '../../components/ui/auth-form-layout';
import { notifyError } from '../../lib/appNotify';

export default function ForgotPasswordScreen() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResetRequest = async () => {
    const cleanedEmail = email.trim().toLowerCase();
    if (!cleanedEmail) {
      setError('Podaj adres e-mail.');
      return;
    }

    setLoading(true);
    setError(null);
    const { error: resetError } = await requestPasswordReset(cleanedEmail);
    setLoading(false);

    if (resetError) {
      notifyError(resetError.message);
      return;
    }

    router.replace({ pathname: '/(auth)/check-email', params: { email: cleanedEmail, mode: 'recovery' } });
  };

  return (
    <AuthFormLayout>
      <AuthFormSection title="Reset hasła">
        <AuthSecondaryText>Wyślemy link do ustawienia nowego hasła.</AuthSecondaryText>
        <AuthTextField
          placeholder="E-mail"
          value={email}
          keyboardType="email-address"
          onChangeText={(text) => {
            setError(null);
            setEmail(text);
          }}
        />
        {error ? <AuthErrorText>{error}</AuthErrorText> : null}
        <AuthPrimaryButton
          label={loading ? 'Wysyłanie...' : 'Wyślij link resetu'}
          onPress={handleResetRequest}
          disabled={loading}
        />
        <AuthSecondaryButton label="Wróć do logowania" onPress={() => router.replace('/(auth)/login')} />
      </AuthFormSection>
    </AuthFormLayout>
  );
}
