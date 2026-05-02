import {
  StyleSheet,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../hooks/useAuth';
import { useAppTheme } from '../../hooks/useAppTheme';
import { Host, Form, Section, Text, TextField, SecureField, Button } from '@expo/ui/swift-ui';
import {
  foregroundStyle,
  font,
  textFieldStyle,
  keyboardType,
  textInputAutocapitalization,
  autocorrectionDisabled,
  padding,
  buttonStyle,
  controlSize,
  disabled,
} from '@expo/ui/swift-ui/modifiers';

function isEmailValid(email: string) {
  return /\S+@\S+\.\S+/.test(email);
}

export default function RegisterScreen() {
  const { statusBarStyle } = useAppTheme();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async () => {
    const cleanedEmail = email.trim().toLowerCase();
    if (!isEmailValid(cleanedEmail)) {
      setError('Podaj poprawny adres e-mail.');
      return;
    }
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
    const { error } = await signUp(cleanedEmail, password);
    setLoading(false);

    if (error) {
      if (error.message.includes('User already registered')) {
        setError('To konto już istnieje. Zaloguj się.');
      } else if (error.message.includes('Password should be at least')) {
        setError('Hasło musi mieć minimum 8 znaków.');
      } else {
        setError(error.message);
      }
      return;
    }

    router.replace({ pathname: '/(auth)/check-email', params: { email: cleanedEmail, mode: 'signup' } });
  };

  const primaryButtonModifiers = [
    buttonStyle('borderedProminent'),
    controlSize('large'),
    ...(loading ? [disabled(true)] : []),
  ];

  const secondaryButtonModifiers = [buttonStyle('plain')];

  return (
    <Host style={styles.container} useViewportSizeMeasurement colorScheme={statusBarStyle === 'light' ? 'dark' : 'light'}>
      <StatusBar style={statusBarStyle} />
      <Form modifiers={[padding({ horizontal: 12, top: 12 })]}>
        <Section title="Załóż konto">
          <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' }), font({ size: 14, design: 'rounded' })]}>
            Utwórz konto e-mail + hasło, aby korzystać z NiX.
          </Text>
          <TextField
          placeholder="E-mail"
          defaultValue={email}
          onValueChange={(value) => {
            setError(null);
            setEmail(value);
          }}
          modifiers={[
            textFieldStyle('automatic'),
            keyboardType('email-address'),
            textInputAutocapitalization('never'),
            autocorrectionDisabled(true),
          ]}
        />
          <SecureField
          placeholder="Hasło (min. 8 znaków)"
          defaultValue={password}
          onValueChange={(value) => {
            setError(null);
            setPassword(value);
          }}
          modifiers={[textFieldStyle('automatic')]}
        />
          <SecureField
          placeholder="Powtórz hasło"
          defaultValue={confirmPassword}
          onValueChange={(value) => {
            setError(null);
            setConfirmPassword(value);
          }}
          modifiers={[textFieldStyle('automatic')]}
        />

          {error ? <Text modifiers={[foregroundStyle({ type: 'color', color: 'red' }), font({ size: 13, design: 'rounded' })]}>{error}</Text> : null}

          <Button
            label={loading ? 'Rejestracja…' : 'Zarejestruj'}
            onPress={handleRegister}
            modifiers={primaryButtonModifiers}
          />

          <Button
            label="Masz konto? Zaloguj się"
            onPress={() => router.replace('/(auth)/login')}
            modifiers={secondaryButtonModifiers}
          />
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
