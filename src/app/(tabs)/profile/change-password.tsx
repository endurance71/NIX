import { StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../../hooks/useAuth';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { Host, Form, Section, Text, SecureField, Button } from '@expo/ui/swift-ui';
import { font, foregroundStyle, textFieldStyle, padding } from '@expo/ui/swift-ui/modifiers';
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
  const { statusBarStyle } = useAppTheme();
  const { session, loading: authLoading, updatePassword, reauthenticatePasswordChange } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nonce, setNonce] = useState('');
  const [requiresNonce, setRequiresNonce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !session) {
      router.replace('/(auth)/login');
    }
  }, [authLoading, session]);

  const handleSubmit = async () => {
    if (newPassword.length < 8) {
      setError('Nowe hasło musi mieć minimum 8 znaków.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Hasła nie są takie same.');
      return;
    }
    if (requiresNonce && !nonce.trim()) {
      setError('Wpisz kod weryfikacyjny z e-maila.');
      return;
    }

    setLoading(true);
    setError(null);

    const { error: updateErr } = await updatePassword(newPassword, requiresNonce ? nonce.trim() : undefined);

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
    <Host style={styles.container} useViewportSizeMeasurement colorScheme={statusBarStyle === 'light' ? 'dark' : 'light'}>
      <StatusBar style={statusBarStyle} />
      <Form modifiers={[padding({ horizontal: 12, top: 12 })]}>
        <Section title="Zmiana hasła">
          <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' }), font({ size: 14, design: 'rounded' })]}>
            Ustaw nowe hasło. Gdy Supabase poprosi o dodatkową weryfikację, wpisz kod przesłany e-mailem.
          </Text>
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
          {requiresNonce ? (
            <SecureField
              placeholder="Kod weryfikacyjny z e-maila"
              defaultValue={nonce}
              onValueChange={(value) => {
                setError(null);
                setNonce(value);
              }}
              modifiers={[textFieldStyle('roundedBorder')]}
            />
          ) : null}
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
