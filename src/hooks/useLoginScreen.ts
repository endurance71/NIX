import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTranslation } from 'react-i18next';
import { useAuth } from './useAuth';
import {
  APPLE_SIGN_IN_ERROR_CODES,
  isSocialAuthNotConfiguredError,
} from '../services/socialAuthService';
import { tap, notify } from '../lib/haptics';

function getAppleSignInErrorMessage(message: string, t: (key: string) => string) {
  if (message === APPLE_SIGN_IN_ERROR_CODES.NO_IDENTITY_TOKEN) {
    return t('auth.appleSignInNoToken');
  }
  if (message === APPLE_SIGN_IN_ERROR_CODES.UNAVAILABLE) {
    return t('auth.appleSignInUnavailable');
  }
  if (message.toLowerCase().includes('nonce')) {
    return t('auth.appleSignInFailed');
  }
  return message || t('auth.appleSignInFailed');
}

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
  const { signIn, signInWithApple } = useAuth();

  const [emailVal, setEmailVal] = useState('');
  const [passwordVal, setPasswordVal] = useState('');
  const email = { value: emailVal };
  const password = { value: passwordVal };
  const emailRef = useRef('');
  const passwordRef = useRef('');

  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appleSignInAvailable, setAppleSignInAvailable] = useState(
    process.env.EXPO_OS === 'ios',
  );

  useEffect(() => {
    if (process.env.EXPO_OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync().then(setAppleSignInAvailable);
  }, []);

  const authBusy = loading || appleLoading;
  const showAppleSignIn = process.env.EXPO_OS === 'ios' && appleSignInAvailable;

  const onEmailChange = (text: string) => {
    emailRef.current = text;
    setEmailVal(text);
  };

  const onPasswordChange = (text: string) => {
    passwordRef.current = text;
    setPasswordVal(text);
  };

  const clearError = () => {
    setError(null);
    tap('light');
  };

  const handleSignIn = async () => {
    const trimmedEmail = emailRef.current.trim().toLowerCase();
    const passwordValue = passwordRef.current;

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
    try {
      const { error: signInError } = await signIn(trimmedEmail, passwordValue);

      if (signInError) {
        setError(getAuthErrorMessage(signInError.message, t));
        notify('error');
      } else {
        notify('success');
      }
    } catch (cause) {
      setError(getAuthErrorMessage(cause instanceof Error ? cause.message : String(cause), t));
      notify('error');
    }
    setLoading(false);
  };

  const handleAppleSignIn = async () => {
    if (authBusy) return;

    setError(null);
    setAppleLoading(true);
    tap('medium');

    try {
      const { data, error: appleError } = await signInWithApple();

      if (appleError) {
        if (isSocialAuthNotConfiguredError(appleError.message)) {
          setError(t('auth.socialAuthNotConfiguredApple'));
          notify('error');
        } else {
          setError(getAppleSignInErrorMessage(appleError.message, t));
          notify('error');
        }
      } else if (data?.session) {
        notify('success');
      }
    } catch (cause) {
      setError(getAppleSignInErrorMessage(cause instanceof Error ? cause.message : String(cause), t));
      notify('error');
    }
    setAppleLoading(false);
  };

  return {
    t,
    email,
    password,
    error,
    loading,
    authBusy,
    showAppleSignIn,
    onEmailChange,
    onPasswordChange,
    clearError,
    handleSignIn,
    handleAppleSignIn,
    goToForgotPassword,
    goToRegister,
  };
}

export type LoginScreenViewModel = ReturnType<typeof useLoginScreen>;
