import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInputRef } from '@expo/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAuthRegisterCredentials } from '../../hooks/useAuthCredentials';
import {
  AuthErrorText,
  AuthFieldGroup,
  AuthFooterPrompt,
  AuthFormLayout,
  AuthSecureField,
  AuthTextField,
} from '../../components/ui/auth-form-layout';
import { AuthLabeledField } from '../../components/ui/auth-labeled-field';
import { AuthPrimaryButton } from '../../components/ui/auth-primary-button';
import { isAtLeastMinimumAge, isValidBirthDate } from '../../lib/ageGate';
import { runWithFinally } from '../../lib/runWithFinally';

function isEmailValid(email: string) {
  return /\S+@\S+\.\S+/.test(email);
}

export default function RegisterScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { signUp } = useAuth();
  const {
    email,
    password,
    confirmPassword,
    onEmailChange,
    onPasswordChange,
    onConfirmPasswordChange,
    getTrimmedEmail,
    getPassword,
    getConfirmPassword,
  } = useAuthRegisterCredentials();
  const [loading, setLoading] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [birthDate, setBirthDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInputRef>(null);
  const confirmPasswordRef = useRef<TextInputRef>(null);

  const clearError = () => {
    setError(null);
  };

  const handleRegister = async () => {
    const cleanedEmail = getTrimmedEmail();
    const passwordValue = getPassword();
    const confirmPasswordValue = getConfirmPassword();

    if (!isEmailValid(cleanedEmail)) {
      setError(t('auth.invalidEmail'));
      return;
    }
    if (passwordValue.length < 8) {
      setError(t('auth.passwordMin'));
      return;
    }
    if (passwordValue !== confirmPasswordValue) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    if (!isValidBirthDate(birthDate)) {
      setError(t('auth.birthDateInvalid'));
      return;
    }
    if (!isAtLeastMinimumAge(birthDate)) {
      setError(t('auth.minimumAgeRequired'));
      return;
    }
    if (!acceptedLegal) {
      setError(t('auth.legalAcceptanceRequired'));
      return;
    }

    setLoading(true);
    setError(null);
    await runWithFinally(
      async () => {
        try {
          const { error: signUpError } = await signUp(cleanedEmail, passwordValue, acceptedLegal);

          if (signUpError) {
            if (signUpError.message.includes('User already registered')) {
              setError(t('auth.accountExists'));
            } else if (signUpError.message.includes('Password should be at least')) {
              setError(t('auth.passwordMin'));
            } else {
              setError(signUpError.message);
            }
          } else {
            router.replace({ pathname: '/(auth)/check-email', params: { email: cleanedEmail, mode: 'signup' } });
          }
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      },
      () => setLoading(false)
    );
  };

  return (
    <AuthFormLayout description={t('auth.registerDescription')}>
      <AuthFieldGroup labeled>
        <AuthLabeledField label={t('auth.emailLabel')}>
          <AuthTextField
            nativeValue={email}
            placeholder={t('auth.emailPlaceholder')}
            keyboardType="email-address"
            autoComplete="email"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            onChangeText={(text) => {
              onEmailChange(text);
              clearError();
            }}
            editable={!loading}
            testID="register-email"
          />
        </AuthLabeledField>
        <AuthLabeledField label={t('auth.passwordLabel')}>
          <AuthSecureField
            ref={passwordRef}
            nativeValue={password}
            placeholder={t('auth.passwordField')}
            autoComplete="new-password"
            returnKeyType="next"
            onSubmitEditing={() => confirmPasswordRef.current?.focus()}
            onChangeText={(text) => {
              onPasswordChange(text);
              clearError();
            }}
            editable={!loading}
            testID="register-password"
          />
        </AuthLabeledField>
        <AuthLabeledField label={t('auth.confirmPasswordField')}>
          <AuthSecureField
            ref={confirmPasswordRef}
            nativeValue={confirmPassword}
            placeholder={t('auth.confirmPasswordField')}
            autoComplete="new-password"
            returnKeyType="go"
            onSubmitEditing={() => void handleRegister()}
            onChangeText={(text) => {
              onConfirmPasswordChange(text);
              clearError();
            }}
            editable={!loading}
            testID="register-confirm-password"
          />
        </AuthLabeledField>
        <AuthLabeledField label={t('auth.birthDateLabel')}>
          <AuthTextField
            nativeValue={birthDate}
            placeholder={t('auth.birthDatePlaceholder')}
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            onChangeText={(text) => {
              setBirthDate(text);
              clearError();
            }}
            editable={!loading}
            testID="register-birth-date"
          />
        </AuthLabeledField>
      </AuthFieldGroup>

      {error ? <AuthErrorText>{error}</AuthErrorText> : null}

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: acceptedLegal }}
        disabled={loading}
        onPress={() => {
          setAcceptedLegal((value) => !value);
          clearError();
        }}
        style={styles.legalAcceptance}
        testID="register-legal-acceptance">
        <View
          style={[
            styles.checkbox,
            { borderColor: colors.systemBlue },
            acceptedLegal ? { backgroundColor: colors.systemBlue } : null,
          ]}>
          {acceptedLegal ? <Text style={styles.checkboxMark}>✓</Text> : null}
        </View>
        <Text style={[styles.legalText, { color: colors.secondaryLabel }]}>
          {t('auth.legalAcceptance')}
        </Text>
      </Pressable>

      <AuthPrimaryButton
        label={t('auth.registerButton')}
        loading={loading}
        onPress={() => void handleRegister()}
        disabled={loading || !acceptedLegal}
      />
      <AuthFooterPrompt
        prompt={t('auth.hasAccountPrompt')}
        linkLabel={t('auth.hasAccountLink')}
        onPress={() => router.replace('/(auth)/login')}
      />
    </AuthFormLayout>
  );
}

const styles = StyleSheet.create({
  legalAcceptance: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMark: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  legalText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
