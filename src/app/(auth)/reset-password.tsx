import { router } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { FieldGroup } from '@expo/ui';
import {
  AuthErrorText,
  AuthFormLayout,
  AuthFormHeader,
  AuthFormFooter,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthSecureField,
} from '../../components/ui/auth-form-layout';
import { useAuthPasswordPair } from '../../hooks/useAuthCredentials';

export default function ResetPasswordScreen() {
  const {
    password,
    confirmPassword,
    onPasswordChange,
    onConfirmPasswordChange,
    getPassword,
    getConfirmPassword,
  } = useAuthPasswordPair();
  const { width: windowWidth } = useWindowDimensions();
  const [error, setError] = useState<string | null>(null);

  const contentWidth = Math.max(260, windowWidth - 56);

  const clearError = () => {
    setError(null);
  };

  const handleReset = () => {
    const passwordValue = getPassword();
    const confirmPasswordValue = getConfirmPassword();

    if (passwordValue.length < 8) {
      setError('Hasło musi mieć co najmniej 8 znaków.');
      return;
    }
    if (passwordValue !== confirmPasswordValue) {
      setError('Hasła nie są identyczne.');
      return;
    }
    router.replace('/(auth)/login');
  };

  return (
    <AuthFormLayout>
      <FieldGroup.Section>
        <FieldGroup.SectionHeader>
          <AuthFormHeader
            title="Nowe hasło"
            description="Ustaw nowe hasło do konta."
          />
        </FieldGroup.SectionHeader>

        <AuthSecureField
          nativeValue={password}
          placeholder="Nowe hasło"
          autoComplete="new-password"
          onChangeText={(text) => {
            onPasswordChange(text);
            clearError();
          }}
        />
        <AuthSecureField
          nativeValue={confirmPassword}
          placeholder="Powtórz hasło"
          autoComplete="new-password"
          onChangeText={(text) => {
            onConfirmPasswordChange(text);
            clearError();
          }}
        />

        <FieldGroup.SectionFooter>
          <AuthFormFooter>
            {error ? <AuthErrorText>{error}</AuthErrorText> : null}

            <AuthPrimaryButton
              label="Zapisz hasło"
              onPress={handleReset}
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
