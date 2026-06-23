import { StyleSheet } from 'react-native';
import { useEffect, useReducer } from 'react';
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
  const [state, dispatch] = useReducer(
    (
      current: {
        newPassword: string;
        confirmPassword: string;
        nonce: string;
        requiresNonce: boolean;
        loading: boolean;
        error: string | null;
      },
      action:
        | { type: 'set_new_password'; value: string }
        | { type: 'set_confirm_password'; value: string }
        | { type: 'set_nonce'; value: string }
        | { type: 'set_requires_nonce'; value: boolean }
        | { type: 'set_loading'; value: boolean }
        | { type: 'set_error'; value: string | null }
    ) => {
      switch (action.type) {
        case 'set_new_password':
          return { ...current, newPassword: action.value, error: null };
        case 'set_confirm_password':
          return { ...current, confirmPassword: action.value, error: null };
        case 'set_nonce':
          return { ...current, nonce: action.value, error: null };
        case 'set_requires_nonce':
          return { ...current, requiresNonce: action.value };
        case 'set_loading':
          return { ...current, loading: action.value };
        case 'set_error':
          return { ...current, error: action.value };
        default:
          return current;
      }
    },
    {
      newPassword: '',
      confirmPassword: '',
      nonce: '',
      requiresNonce: false,
      loading: false,
      error: null,
    }
  );
  const { newPassword, confirmPassword, nonce, requiresNonce, loading, error } = state;

  useEffect(() => {
    if (!authLoading && !session) {
      router.replace('/(auth)/login');
    }
  }, [authLoading, session]);

  const handleSubmit = async () => {
    if (newPassword.length < 8) {
      dispatch({ type: 'set_error', value: 'Nowe hasło musi mieć minimum 8 znaków.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      dispatch({ type: 'set_error', value: 'Hasła nie są takie same.' });
      return;
    }
    if (requiresNonce && !nonce.trim()) {
      dispatch({ type: 'set_error', value: 'Wpisz kod weryfikacyjny z e-maila.' });
      return;
    }

    dispatch({ type: 'set_loading', value: true });
    dispatch({ type: 'set_error', value: null });

    const { error: updateErr } = await updatePassword(newPassword, requiresNonce ? nonce.trim() : undefined);

    if (updateErr) {
      if (!requiresNonce && isReauthenticationNeededError(updateErr)) {
        const { error: reauthError } = await reauthenticatePasswordChange();
        if (reauthError) {
          dispatch({ type: 'set_error', value: getPasswordUpdateErrorMessage(reauthError.message) });
          dispatch({ type: 'set_loading', value: false });
          return;
        }

        dispatch({ type: 'set_requires_nonce', value: true });
        dispatch({ type: 'set_loading', value: false });
        dispatch({
          type: 'set_error',
          value: 'Wysłaliśmy kod weryfikacyjny na e-mail. Wpisz go poniżej i zapisz hasło ponownie.',
        });
        return;
      }

      dispatch({ type: 'set_loading', value: false });
      dispatch({ type: 'set_error', value: getPasswordUpdateErrorMessage(updateErr.message) });
      return;
    }

    dispatch({ type: 'set_loading', value: false });
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
            onTextChange={(text) => {
              dispatch({ type: 'set_new_password', value: text });
            }}
            modifiers={[textFieldStyle('roundedBorder')]}
          />
          <SecureField
            placeholder="Powtórz nowe hasło"
            onTextChange={(text) => {
              dispatch({ type: 'set_confirm_password', value: text });
            }}
            modifiers={[textFieldStyle('roundedBorder')]}
          />
          {requiresNonce ? (
            <SecureField
              placeholder="Kod weryfikacyjny z e-maila"
              onTextChange={(text) => {
                dispatch({ type: 'set_nonce', value: text });
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
