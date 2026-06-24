import { router } from 'expo-router';
import { useState } from 'react';
import {
  AuthErrorText,
  AuthFormLayout,
  AuthFormSection,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthSecondaryText,
  AuthSecureField,
} from '../../components/ui/auth-form-layout';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleReset = () => {
    if (password.length < 8) {
      setError('Hasło musi mieć co najmniej 8 znaków.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Hasła nie są identyczne.');
      return;
    }
    router.replace('/(auth)/login');
  };

  return (
    <AuthFormLayout>
      <AuthFormSection title="Nowe hasło">
        <AuthSecondaryText>Ustaw nowe hasło do konta.</AuthSecondaryText>
        <AuthSecureField
          placeholder="Nowe hasło"
          value={password}
          onChangeText={(text) => {
            setError(null);
            setPassword(text);
          }}
        />
        <AuthSecureField
          placeholder="Powtórz hasło"
          value={confirmPassword}
          onChangeText={(text) => {
            setError(null);
            setConfirmPassword(text);
          }}
        />
        {error ? <AuthErrorText>{error}</AuthErrorText> : null}
        <AuthPrimaryButton label="Zapisz hasło" onPress={handleReset} />
        <AuthSecondaryButton label="Wróć do logowania" onPress={() => router.replace('/(auth)/login')} />
      </AuthFormSection>
    </AuthFormLayout>
  );
}
