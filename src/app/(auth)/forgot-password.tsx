import {
  StyleSheet,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../hooks/useAuth';
import { useAppTheme } from '../../hooks/useAppTheme';
import { Host, Form, Section, Text, TextField, Button } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  textFieldStyle,
  keyboardType,
  textInputAutocapitalization,
  autocorrectionDisabled,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { notifyError } from '../../lib/appNotify';

export default function ForgotPasswordScreen() {
  const { statusBarStyle } = useAppTheme();
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
    const { error } = await requestPasswordReset(cleanedEmail);
    setLoading(false);

    if (error) {
      notifyError(error.message);
      return;
    }

    router.replace({ pathname: '/(auth)/check-email', params: { email: cleanedEmail, mode: 'recovery' } });
  };

  return (
    <Host style={styles.container} useViewportSizeMeasurement colorScheme={statusBarStyle === 'light' ? 'dark' : 'light'}>
      <StatusBar style={statusBarStyle} />
      <Form modifiers={[padding({ horizontal: 12, top: 12 })]}>
        <Section title="Reset hasła">
          <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' }), font({ size: 14, design: 'rounded' })]}>
            Wyślemy link do ustawienia nowego hasła.
          </Text>
          <TextField
          placeholder="E-mail"
          defaultValue={email}
          onValueChange={(value) => {
            setError(null);
            setEmail(value);
          }}
          modifiers={[
            textFieldStyle('roundedBorder'),
            keyboardType('email-address'),
            textInputAutocapitalization('never'),
            autocorrectionDisabled(true),
          ]}
        />
          {error ? <Text modifiers={[foregroundStyle({ type: 'color', color: 'red' }), font({ size: 13, design: 'rounded' })]}>{error}</Text> : null}
          <Button label={loading ? 'Wysyłanie...' : 'Wyślij link resetu'} onPress={handleResetRequest} />
          <Button label="Wróć do logowania" onPress={() => router.replace('/(auth)/login')} />
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
