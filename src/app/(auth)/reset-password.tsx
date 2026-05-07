import {
  StyleSheet,
} from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../hooks/useAuth';
import { getCurrentUserProfile } from '../../services/profileService';
import { useAppTheme } from '../../hooks/useAppTheme';
import { Host, Form, Section, Text, SecureField, Button } from '@expo/ui/swift-ui';
import { font, foregroundStyle, textFieldStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { notifyError } from '../../lib/appNotify';

export default function ResetPasswordScreen() {
  const { statusBarStyle } = useAppTheme();
  const { session, loading: authLoading, updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !session) {
      router.replace('/(auth)/login');
    }
  }, [authLoading, session]);

  const handleUpdatePassword = async () => {
    if (password.length < 8) {
      setError('Hasło musi mieć minimum 8 znaków.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Hasła nie są takie same.');
      return;
    }

    setLoading(true);
    setError(null);
    const { error } = await updatePassword(password);
    setLoading(false);

    if (error) {
      notifyError(error.message);
      return;
    }

    try {
      const profile = await getCurrentUserProfile();
      router.replace(profile?.username ? '/profile' : '/(auth)/onboarding');
    } catch {
      router.replace('/profile');
    }
  };

  return (
    <Host style={styles.container} useViewportSizeMeasurement colorScheme={statusBarStyle === 'light' ? 'dark' : 'light'}>
      <StatusBar style={statusBarStyle} />
      <Form modifiers={[padding({ horizontal: 12, top: 12 })]}>
        <Section title="Ustaw nowe hasło">
          <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' }), font({ size: 14, design: 'rounded' })]}>
            Wprowadź nowe hasło do konta NiX.
          </Text>
          <SecureField
          placeholder="Nowe hasło"
          defaultValue={password}
          onValueChange={(value) => {
            setError(null);
            setPassword(value);
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
          {error ? <Text modifiers={[foregroundStyle({ type: 'color', color: 'red' }), font({ size: 13, design: 'rounded' })]}>{error}</Text> : null}
          <Button label={loading ? 'Zapisywanie...' : 'Zapisz hasło'} onPress={handleUpdatePassword} />
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
