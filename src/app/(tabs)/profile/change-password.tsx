import { StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../../hooks/useAuth';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { Host, Form, Section, Text, SecureField, Button } from '@expo/ui/swift-ui';
import { font, foregroundStyle, textFieldStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { notifySuccess } from '../../../lib/appNotify';

function getVerifyPasswordErrorMessage(message: string) {
  if (message.includes('Invalid login credentials')) return 'Nieprawidłowe aktualne hasło.';
  if (message.includes('Email not confirmed')) return 'Najpierw potwierdź e-mail. Sprawdź skrzynkę.';
  return message;
}

export default function ChangePasswordScreen() {
  const { statusBarStyle } = useAppTheme();
  const { session, user, signIn, updatePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !user?.email) {
      router.replace('/(auth)/login');
    }
  }, [session, user?.email]);

  const handleSubmit = async () => {
    const email = user?.email?.trim().toLowerCase();
    if (!email) {
      router.replace('/(auth)/login');
      return;
    }

    if (!currentPassword) {
      setError('Podaj aktualne hasło.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Nowe hasło musi mieć minimum 8 znaków.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Hasła nie są takie same.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Nowe hasło musi być inne niż aktualne.');
      return;
    }

    setLoading(true);
    setError(null);

    const signInResult = await signIn(email, currentPassword);
    if (signInResult.error) {
      setLoading(false);
      setError(getVerifyPasswordErrorMessage(signInResult.error.message));
      return;
    }

    const { error: updateErr } = await updatePassword(newPassword);
    setLoading(false);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }

    notifySuccess('Hasło zostało zmienione.');
    router.back();
  };

  return (
    <Host style={styles.container} useViewportSizeMeasurement colorScheme={statusBarStyle === 'light' ? 'dark' : 'light'}>
      <StatusBar style={statusBarStyle} />
      <Form modifiers={[padding({ horizontal: 12, top: 12 })]}>
        <Section title="Zmiana hasła">
          <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' }), font({ size: 14, design: 'rounded' })]}>
            Najpierw potwierdź aktualne hasło, potem ustaw nowe.
          </Text>
          <SecureField
            placeholder="Aktualne hasło"
            defaultValue={currentPassword}
            onValueChange={(value) => {
              setError(null);
              setCurrentPassword(value);
            }}
            modifiers={[textFieldStyle('roundedBorder')]}
          />
          <SecureField
            placeholder="Nowe hasło (min. 8 znaków)"
            defaultValue={newPassword}
            onValueChange={(value) => {
              setError(null);
              setNewPassword(value);
            }}
            modifiers={[textFieldStyle('roundedBorder')]}
          />
          <SecureField
            placeholder="Powtórz nowe hasło"
            defaultValue={confirmPassword}
            onValueChange={(value) => {
              setError(null);
              setConfirmPassword(value);
            }}
            modifiers={[textFieldStyle('roundedBorder')]}
          />
          {error ? (
            <Text modifiers={[foregroundStyle({ type: 'color', color: 'red' }), font({ size: 13, design: 'rounded' })]}>{error}</Text>
          ) : null}
          <Button label={loading ? 'Zapisywanie...' : 'Zapisz nowe hasło'} onPress={handleSubmit} />
        </Section>
      </Form>
    </Host>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
