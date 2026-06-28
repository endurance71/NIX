import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { useScreenInsets } from '../../../hooks/useScreenInsets';
import { notifySuccess } from '../../../lib/appNotify';
import { typography } from '../../../theme/typography';

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
  const { colors } = useAppTheme();
  const { bottomContentInset } = useScreenInsets('tabStackList');
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

  const clearError = () => {
    setError(null);
  };

  const handleSubmit = async () => {
    const newPasswordValue = newPassword;
    const confirmPasswordValue = confirmPassword;
    const nonceValue = nonce.trim();

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
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: bottomContentInset + 32 }]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <Text style={[styles.description, { color: colors.secondaryLabel }]}>
        Ustaw nowe hasło. Gdy Supabase poprosi o dodatkową weryfikację, wpisz kod przesłany e-mailem.
      </Text>

      <View style={[styles.card, { backgroundColor: colors.secondarySystemBackground }]}>
        <TextInput
          style={[styles.input, { color: colors.label, borderBottomColor: colors.separator }]}
          placeholder="Nowe hasło (min. 8 znaków)"
          placeholderTextColor={colors.tertiaryLabel}
          secureTextEntry
          autoComplete="new-password"
          value={newPassword}
          onChangeText={(text) => {
            setNewPassword(text);
            clearError();
          }}
        />
        <TextInput
          style={[styles.input, { color: colors.label, borderBottomColor: colors.separator }]}
          placeholder="Powtórz nowe hasło"
          placeholderTextColor={colors.tertiaryLabel}
          secureTextEntry
          autoComplete="new-password"
          value={confirmPassword}
          onChangeText={(text) => {
            setConfirmPassword(text);
            clearError();
          }}
        />
        {requiresNonce ? (
          <TextInput
            style={[styles.input, { color: colors.label, borderBottomColor: colors.separator }]}
            placeholder="Kod weryfikacyjny z e-maila"
            placeholderTextColor={colors.tertiaryLabel}
            secureTextEntry
            autoComplete="one-time-code"
            value={nonce}
            onChangeText={(text) => {
              setNonce(text);
              clearError();
            }}
          />
        ) : null}
        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: loading }}
          disabled={loading}
          onPress={() => void handleSubmit()}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.accent },
            pressed && !loading ? styles.pressed : null,
            loading ? styles.disabled : null,
          ]}>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Zapisz nowe hasło</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 20,
  },
  description: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: 18,
  },
  card: {
    borderRadius: 28,
    borderCurve: 'continuous',
    overflow: 'hidden',
    paddingBottom: 20,
  },
  input: {
    ...typography.body,
    minHeight: 58,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  error: {
    ...typography.footnote,
    paddingHorizontal: 22,
    paddingTop: 14,
    textAlign: 'center',
  },
  button: {
    alignSelf: 'center',
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingHorizontal: 22,
    marginTop: 20,
  },
  buttonText: {
    ...typography.body,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.55,
  },
});
