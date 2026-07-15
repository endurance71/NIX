import { useReducer, useEffect } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { clearUserCache } from '../services/profileService';
import {
  signInWithPassword as requestPasswordSignIn,
  signUpWithPassword as requestPasswordSignUp,
  requestPasswordReset as requestPasswordResetEmail,
  updatePassword as requestPasswordUpdate,
  reauthenticatePasswordChange as requestPasswordReauthenticate,
  signOut as requestSignOut,
} from '../services/authService';
import {
  signInWithApple as requestAppleSignIn,
  signInWithGoogle as requestGoogleSignIn,
} from '../services/socialAuthService';
import { getCurrentLocale } from '../lib/i18n';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

type AuthAction =
  | { type: 'hydrated'; session: Session | null }
  | { type: 'bootstrap_timeout' };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'hydrated':
      return {
        session: action.session,
        user: action.session?.user ?? null,
        loading: false,
      };
    case 'bootstrap_timeout':
      return state.loading ? { ...state, loading: false } : state;
    default:
      return state;
  }
}

async function signIn(email: string, password: string) {
  const { data, error } = await requestPasswordSignIn(email, password);
  return { data, error };
}

async function signInWithGoogle() {
  const { data, error } = await requestGoogleSignIn();
  return { data, error };
}

async function signInWithApple() {
  const { data, error } = await requestAppleSignIn();
  return { data, error };
}

async function signUp(email: string, password: string, acceptedLegal = false) {
  const locale = getCurrentLocale();
  const { data, error } = await requestPasswordSignUp(email, password, locale, acceptedLegal);
  return { data, error };
}

async function verifyOTP(email: string, token: string, type: 'signup' | 'recovery' | 'email') {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type,
  });
  return { data, error };
}

async function requestPasswordReset(email: string) {
  const { data, error } = await requestPasswordResetEmail(email);
  return { data, error };
}

async function updatePassword(password: string, currentPassword?: string, nonce?: string) {
  const { data, error } = await requestPasswordUpdate(password, currentPassword, nonce);
  return { data, error };
}

async function reauthenticatePasswordChange() {
  const { data, error } = await requestPasswordReauthenticate();
  return { data, error };
}

async function logout() {
  clearUserCache();
  const { error } = await requestSignOut();
  return { error };
}

export function useAuth() {
  const [{ session, user, loading }, dispatch] = useReducer(authReducer, {
    session: null,
    user: null,
    loading: true,
  });

  useEffect(() => {
    let mounted = true;

    const authBootstrapTimeout = setTimeout(() => {
      if (mounted) dispatch({ type: 'bootstrap_timeout' });
    }, 5000);

    supabase.auth.getSession().then(({ data: { session: nextSession } }) => {
      if (!mounted) return;
      dispatch({ type: 'hydrated', session: nextSession });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      dispatch({ type: 'hydrated', session: nextSession });
    });

    return () => {
      mounted = false;
      clearTimeout(authBootstrapTimeout);
      subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    user,
    loading,
    signIn,
    signInWithGoogle,
    signInWithApple,
    signUp,
    verifyOTP,
    requestPasswordReset,
    updatePassword,
    reauthenticatePasswordChange,
    signOut: logout,
  };
}
