import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTranslation } from 'react-i18next';
import { useAuth } from './useAuth';
import { useAuthCredentials } from './useAuthCredentials';
import { isSocialAuthNotConfiguredError } from '../services/socialAuthService';
import type { SocialAuthProvider } from '../services/socialAuthService';
import { tap, notify } from '../lib/haptics';
import { getAuthContentWidth } from '../theme/authLayout';

function getAuthErrorMessage(message: string, t: (key: string) => string) {
  if (message.includes('Invalid login credentials')) return t('auth.invalidCredentials');
  if (message.includes('Email not confirmed')) return t('auth.emailNotConfirmed');
  return message;
}

function goToForgotPassword() {
  router.push('/(auth)/forgot-password');
}

function goToRegister() {
  router.push('/(auth)/register');
}

export function useLoginScreen() {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const {
    email,
    password,
    onEmailChange,
    onPasswordChange,
    getTrimmedEmail,
    getPassword,
  } = useAuthCredentials();
  const { signIn, signInWithGoogle, signInWithApple } = useAuth();
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<SocialAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appleSignInAvailable, setAppleSignInAvailable] = useState(process.env.EXPO_OS === 'ios');

  useEffect(() => {
    if (process.env.EXPO_OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync().then(setAppleSignInAvailable);
  }, []);

  const contentWidth = getAuthContentWidth(windowWidth);
  const authBusy = loading || socialLoading !== null;
  const showSocialDivider =
    process.env.EXPO_OS === 'ios' && appleSignInAvailable;

  const clearError = () => {
    setError(null);
    tap('light');
  };

  const getSocialAuthNotConfiguredMessage = (provider: SocialAuthProvider) =>
    provider === 'google' ? t('auth.socialAuthNotConfiguredGoogle') : t('auth.socialAuthNotConfiguredApple');

  const handleSignIn = async (passwordOverride?: string) => {
    const trimmedEmail = getTrimmedEmail();
    const passwordValue = passwordOverride ?? getPassword();

    if (!trimmedEmail) {
      setError(t('auth.emailRequired'));
      notify('error');
      return;
    }
    if (!passwordValue.trim()) {
      setError(t('auth.passwordRequired'));
      notify('error');
      return;
    }

    setLoading(true);
    setError(null);
    tap('medium');
    const { error: signInError } = await signIn(trimmedEmail, passwordValue);
    setLoading(false);

    if (signInError) {
      setError(getAuthErrorMessage(signInError.message, t));
      notify('error');
    } else {
      notify('success');
    }
  };

  const handleSocialSignIn = async (provider: SocialAuthProvider) => {
    if (authBusy) return;

    setError(null);
    setSocialLoading(provider);
    tap('medium');

    const { error: socialError } =
      provider === 'google' ? await signInWithGoogle() : await signInWithApple();

    setSocialLoading(null);

    if (socialError) {
      if (isSocialAuthNotConfiguredError(socialError.message)) {
        setError(getSocialAuthNotConfiguredMessage(provider));
        notify('error');
        return;
      }
      setError(socialError.message);
      notify('error');
    } else {
      notify('success');
    }
  };

  return {
    t,
    email,
    password,
    error,
    loading,
    socialLoading,
    authBusy,
    contentWidth,
    showSocialDivider,
    onEmailChange,
    onPasswordChange,
    clearError,
    handleSignIn,
    handleSocialSignIn,
    goToForgotPassword,
    goToRegister,
  };
}

export type LoginScreenViewModel = ReturnType<typeof useLoginScreen>;
