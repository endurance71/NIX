import { router } from 'expo-router';
import { useReducer } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  AuthErrorText,
  AuthFormLayout,
  AuthFormSection,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthSecondaryText,
  AuthSecureField,
  AuthTextField,
} from '../../components/ui/auth-form-layout';
import { notifyError } from '../../lib/appNotify';
import { useTranslation } from 'react-i18next';

function isEmailValid(email: string) {
  return /\S+@\S+\.\S+/.test(email);
}

export default function RegisterScreen() {
  const { t } = useTranslation();
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
    const { error: signUpError } = await signUp(cleanedEmail, password);
    dispatch({ type: 'set_loading', value: false });

    if (signUpError) {
      if (signUpError.message.includes('User already registered')) {
        notifyError(t('auth.accountExists'));
      } else if (signUpError.message.includes('Password should be at least')) {
        notifyError(t('auth.passwordMin'));
      } else {
        notifyError(signUpError.message);
      }
      return;
    }

    router.replace({ pathname: '/(auth)/check-email', params: { email: cleanedEmail, mode: 'signup' } });
  };

  return (
    <AuthFormLayout>
      <AuthFormSection title={t('auth.registerHeader')}>
        <AuthSecondaryText>{t('auth.registerDescription')}</AuthSecondaryText>
        <AuthTextField
          placeholder={t('auth.emailField')}
          keyboardType="email-address"
          onChangeText={(text) => {
            dispatch({ type: 'set_email', value: text });
          }}
        />
        <AuthSecureField
          placeholder={t('auth.passwordField')}
          onChangeText={(text) => {
            dispatch({ type: 'set_password', value: text });
          }}
        />
        <AuthSecureField
          placeholder={t('auth.confirmPasswordField')}
          onChangeText={(text) => {
            dispatch({ type: 'set_confirm_password', value: text });
          }}
        />
        {error ? <AuthErrorText>{error}</AuthErrorText> : null}
        <AuthPrimaryButton
          label={loading ? t('auth.registerLoading') : t('auth.registerButton')}
          onPress={handleRegister}
          disabled={loading}
        />
        <AuthSecondaryButton label={t('auth.hasAccount')} onPress={() => router.replace('/(auth)/login')} />
      </AuthFormSection>
    </AuthFormLayout>
  );
}
