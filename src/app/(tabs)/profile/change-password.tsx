import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { useScreenInsets } from '../../../hooks/useScreenInsets';
import { notifySuccess } from '../../../lib/appNotify';
import { APP_FONT_FAMILY, typography } from '../../../theme/typography';
import { AppIcon } from '../../../components/ui/app-icon';
import { NativeButton } from '../../../components/ui/native-button';
import type { ThemeColors } from '../../../theme/colors';

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
  if (message.toLowerCase().includes('invalid login credentials') || message.toLowerCase().includes('incorrect password')) {
    return 'Nieprawidłowe aktualne hasło.';
  }
  return message;
}

export default function ChangePasswordScreen() {
  const { colors, isDark } = useAppTheme();
  const { bottomContentInset } = useScreenInsets('tabStackList');
  const { session, loading: authLoading, updatePassword, reauthenticatePasswordChange } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
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
    const currentPasswordValue = currentPassword;
    const newPasswordValue = newPassword;
    const confirmPasswordValue = confirmPassword;
    const nonceValue = nonce.trim();

    if (!currentPasswordValue) {
      setError('Wpisz aktualne hasło.');
      return;
    }
    if (newPasswordValue.length < 8 || !/\d/.test(newPasswordValue) || !/[A-Z]/.test(newPasswordValue) || !/[a-z]/.test(newPasswordValue)) {
      setError('Nowe hasło nie spełnia wymagań bezpieczeństwa.');
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

    const { error: updateErr } = await updatePassword(newPasswordValue, currentPasswordValue, requiresNonce ? nonceValue : undefined);

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

  const checks = {
    length: newPassword.length >= 8,
    digit: /\d/.test(newPassword),
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    match: confirmPassword.length > 0 && newPassword === confirmPassword,
  };

  const isSubmitDisabled =
    loading ||
    !currentPassword ||
    !checks.length ||
    !checks.digit ||
    !checks.upper ||
    !checks.lower ||
    !checks.match ||
    (requiresNonce && !nonce.trim());

  const settingsCardColor = isDark ? colors.secondarySystemBackground : colors.tertiarySystemBackground;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: bottomContentInset + 32 }]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      
      <View style={[styles.iconContainer, { borderColor: colors.accent }]}>
        <AppIcon name="key" size={38} color={colors.accent} />
      </View>

      <Text style={[styles.title, { color: colors.label }]}>Nowe hasło</Text>

      <Text style={[styles.description, { color: colors.secondaryLabel }]}>
        Wybierz bezpieczne hasło, które jesteś w stanie zapamiętać.
      </Text>

      <View style={[styles.card, { backgroundColor: settingsCardColor }]}>
        <TextInput
          style={[styles.input, { color: colors.label, borderBottomColor: colors.separator }]}
          placeholder="Aktualne hasło"
          placeholderTextColor={colors.tertiaryLabel}
          secureTextEntry
          autoComplete="current-password"
          value={currentPassword}
          onChangeText={(text) => {
            setCurrentPassword(text);
            clearError();
          }}
        />
        <TextInput
          style={[styles.input, { color: colors.label, borderBottomColor: colors.separator }]}
          placeholder="Nowe hasło"
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
          style={[
            styles.input,
            { color: colors.label, borderBottomColor: colors.separator },
            !requiresNonce && { borderBottomWidth: 0 },
          ]}
          placeholder="Powtórz hasło"
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
            style={[
              styles.input,
              { color: colors.label, borderBottomColor: colors.separator, borderBottomWidth: 0 },
            ]}
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
      </View>

      <View style={styles.checklist}>
        <ValidationRow label="Minimum 8 znaków" checked={checks.length} colors={colors} />
        <ValidationRow label="Przynajmniej jedna cyfra" checked={checks.digit} colors={colors} />
        <ValidationRow label="Przynajmniej jedna duża litera" checked={checks.upper} colors={colors} />
        <ValidationRow label="Przynajmniej jedna mała litera" checked={checks.lower} colors={colors} />
        <ValidationRow label="Hasła są zgodne" checked={checks.match} colors={colors} />
      </View>

      <View style={styles.buttonContainer}>
        <NativeButton
          label={loading ? 'Zapisywanie...' : 'Zapisz'}
          disabled={isSubmitDisabled}
          onPress={() => void handleSubmit()}
        />
      </View>

      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    </ScrollView>
  );
}

function ValidationRow({
  label,
  checked,
  colors,
}: {
  label: string;
  checked: boolean;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.validationRow}>
      <AppIcon
        name={checked ? 'checkCircle' : 'circle'}
        size={14}
        color={checked ? colors.success : colors.tertiaryLabel}
      />
      <Text
        style={[
          styles.validationLabel,
          { color: checked ? colors.label : colors.secondaryLabel },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 24,
  },
  iconContainer: {
    alignSelf: 'center',
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    fontFamily: APP_FONT_FAMILY,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: 28,
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 24,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  input: {
    ...typography.body,
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checklist: {
    marginTop: 16,
    paddingHorizontal: 16,
    gap: 8,
  },
  validationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  validationLabel: {
    ...typography.footnote,
  },
  buttonContainer: {
    marginTop: 28,
  },
  error: {
    ...typography.footnote,
    paddingHorizontal: 22,
    paddingTop: 14,
    textAlign: 'center',
  },
});
