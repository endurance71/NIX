import {
  StyleSheet,
} from 'react-native';
import { useReducer } from 'react';
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
import { notifyError } from '../../lib/appNotify';
import { useTranslation } from 'react-i18next';

function isEmailValid(email: string) {
  return /\S+@\S+\.\S+/.test(email);
}

export default function RegisterScreen() {
  const { t } = useTranslation();
  const { statusBarStyle } = useAppTheme();
  const { signUp } = useAuth();
  const [state, dispatch] = useReducer(
    (
      current: {
        email: string;
        password: string;
        confirmPassword: string;
        loading: boolean;
        error: string | null;
      },
      action:
        | { type: 'set_email'; value: string }
        | { type: 'set_password'; value: string }
        | { type: 'set_confirm_password'; value: string }
        | { type: 'set_error'; value: string | null }
        | { type: 'set_loading'; value: boolean }
    ) => {
      switch (action.type) {
        case 'set_email':
          return { ...current, email: action.value, error: null };
        case 'set_password':
          return { ...current, password: action.value, error: null };
        case 'set_confirm_password':
          return { ...current, confirmPassword: action.value, error: null };
        case 'set_error':
          return { ...current, error: action.value };
        case 'set_loading':
          return { ...current, loading: action.value };
        default:
          return current;
      }
    },
    {
      email: '',
      password: '',
      confirmPassword: '',
      loading: false,
      error: null,
    }
  );
  const { email, password, confirmPassword, loading, error } = state;

  const handleRegister = async () => {
    const cleanedEmail = email.trim().toLowerCase();
    if (!isEmailValid(cleanedEmail)) {
      dispatch({ type: 'set_error', value: t('auth.invalidEmail') });
      return;
    }
    if (password.length < 8) {
      dispatch({ type: 'set_error', value: t('auth.passwordMin') });
      return;
    }
    if (password !== confirmPassword) {
      dispatch({ type: 'set_error', value: t('auth.passwordMismatch') });
      return;
    }

    dispatch({ type: 'set_loading', value: true });
    dispatch({ type: 'set_error', value: null });
    const { error } = await signUp(cleanedEmail, password);
    dispatch({ type: 'set_loading', value: false });

    if (error) {
      if (error.message.includes('User already registered')) {
        notifyError(t('auth.accountExists'));
      } else if (error.message.includes('Password should be at least')) {
        notifyError(t('auth.passwordMin'));
      } else {
        notifyError(error.message);
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
        <Section title={t('auth.registerHeader')}>
          <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' }), font({ size: 14, design: 'rounded' })]}>
            {t('auth.registerDescription')}
          </Text>
          <TextField
          placeholder={t('auth.emailField')}
          defaultValue={email}
          onValueChange={(value) => {
            dispatch({ type: 'set_email', value });
          }}
          modifiers={[
            textFieldStyle('automatic'),
            keyboardType('email-address'),
            textInputAutocapitalization('never'),
            autocorrectionDisabled(true),
          ]}
        />
          <SecureField
          placeholder={t('auth.passwordField')}
          defaultValue={password}
          onValueChange={(value) => {
            dispatch({ type: 'set_password', value });
          }}
          modifiers={[textFieldStyle('automatic')]}
        />
          <SecureField
          placeholder={t('auth.confirmPasswordField')}
          defaultValue={confirmPassword}
          onValueChange={(value) => {
            dispatch({ type: 'set_confirm_password', value });
          }}
          modifiers={[textFieldStyle('automatic')]}
        />

          {error ? <Text modifiers={[foregroundStyle({ type: 'color', color: 'red' }), font({ size: 13, design: 'rounded' })]}>{error}</Text> : null}

          <Button
            label={loading ? t('auth.registerLoading') : t('auth.registerButton')}
            onPress={handleRegister}
            modifiers={primaryButtonModifiers}
          />

          <Button
            label={t('auth.hasAccount')}
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
