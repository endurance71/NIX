import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useNativeState } from '@expo/ui';
import { useAuth } from '../../../hooks/useAuth';
import { useAuthPasswordPair } from '../../../hooks/useAuthCredentials';
import {
  AuthErrorText,
  AuthFormLayout,
  AuthFormSection,
  AuthPrimaryButton,
  AuthSecondaryText,
  AuthSecureField,
} from '../../../components/ui/auth-form-layout';
import { notifySuccess } from '../../../lib/appNotify';

function isReauthenticationNeededError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const code = error.code?.toLowerCase() ?? '';
  const message = error.message?.toLowerCase() ?? '';
  return code === 'reauthentication_needed' || message.includes('reauthentication');
}

function getPasswordUpdateErrorMessage(message: string) {
  if (message.includes('Password should be at least')) return 'Nowe hasło musi mieć minimum 8 znaków.';
  if (message.toLowerCase().includes('same password')) return 'Nowe hasło musi być inne niż poprzednie.';
  if (message.includes('Email not confirmed')) return 'Najpierw potwierdź e-mail. Sprawdź skrzynkę.';
  if (message.toLowerCase().includes('invalid nonce')) return 'Kod weryfikacyjny jest nieprawidłowy lub wygasł.';
  return message;
}

export default function ChangePasswordScreen() {
  const { session, loading: authLoading, updatePassword, reauthenticatePasswordChange } = useAuth();
  const {
    password: newPassword,
    confirmPassword,
    onPasswordChange,
    onConfirmPasswordChange,
    getPassword,
    getConfirmPassword,
  } = useAuthPasswordPair();
  const nonce = useNativeState('');
  const nonceSnapshot = useRef('');
  const [requiresNonce, setRequiresNonce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => {
    setError(null);
  };

  useEffect(() => {
    if (!authLoading && !session) {
      router.replace('/(auth)/login');
    }
  }, [authLoading, session]);

  const handleSubmit = async () => {
    const newPasswordValue = getPassword();
    const confirmPasswordValue = getConfirmPassword();
    const nonceValue = nonceSnapshot.current.trim();

    if (newPasswordValue.length < 8) {
      setError('Nowe hasło musi mieć minimum 8 znaków.');
      return;
    }
    if (newPasswordValue !== confirmPasswordValue) {
      setError('Hasła nie są takie same.');
      return;
    }
    if (requiresNonce && !nonceValue) {
      setError('Wpisz kod weryfikacyjny z e-maila.');
      return;
    }

    setLoading(true);
    setError(null);

    const { error: updateErr } = await updatePassword(newPasswordValue, requiresNonce ? nonceValue : undefined);

    if (updateErr) {
      if (!requiresNonce && isReauthenticationNeededError(updateErr)) {
        const { error: reauthError } = await reauthenticatePasswordChange();
        if (reauthError) {
          setError(getPasswordUpdateErrorMessage(reauthError.message));
          setLoading(false);
          return;
        }

        setRequiresNonce(true);
        setLoading(false);
        setError('Wysłaliśmy kod weryfikacyjny na e-mail. Wpisz go poniżej i zapisz hasło ponownie.');
        return;
      }

      setLoading(false);
      setError(getPasswordUpdateErrorMessage(updateErr.message));
      return;
    }

    setLoading(false);
    notifySuccess('Hasło zostało zmienione.');
    router.replace('/profile');
  };

  return (
    <AuthFormLayout>
      <AuthFormSection title="Zmiana hasła">
        <AuthSecondaryText>
          Ustaw nowe hasło. Gdy Supabase poprosi o dodatkową weryfikację, wpisz kod przesłany e-mailem.
        </AuthSecondaryText>
        <AuthSecureField
          nativeValue={newPassword}
          placeholder="Nowe hasło (min. 8 znaków)"
          autoComplete="new-password"
          onChangeText={(text) => {
            onPasswordChange(text);
            clearError();
          }}
        />
        <AuthSecureField
          nativeValue={confirmPassword}
          placeholder="Powtórz nowe hasło"
          autoComplete="new-password"
          onChangeText={(text) => {
            onConfirmPasswordChange(text);
            clearError();
          }}
        />
        {requiresNonce ? (
          <AuthSecureField
            nativeValue={nonce}
            placeholder="Kod weryfikacyjny z e-maila"
            autoComplete="one-time-code"
            onChangeText={(text) => {
              nonceSnapshot.current = text;
              clearError();
            }}
          />
        ) : null}
        {error ? <AuthErrorText>{error}</AuthErrorText> : null}
        <AuthPrimaryButton
          label={loading ? 'Zapisywanie...' : 'Zapisz nowe hasło'}
          onPress={() => void handleSubmit()}
          disabled={loading}
        />
      </AuthFormSection>
    </AuthFormLayout>
  );
}
