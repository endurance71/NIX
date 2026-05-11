import { useReducer, useEffect, useCallback } from 'react';
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

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await requestPasswordSignIn(email, password);
    return { data, error };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await requestPasswordSignUp(email, password);
    return { data, error };
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { data, error } = await requestPasswordResetEmail(email);
    return { data, error };
  }, []);

  const updatePassword = useCallback(async (password: string, nonce?: string) => {
    const { data, error } = await requestPasswordUpdate(password, nonce);
    return { data, error };
  }, []);

  const reauthenticatePasswordChange = useCallback(async () => {
    const { data, error } = await requestPasswordReauthenticate();
    return { data, error };
  }, []);

  const logout = useCallback(async () => {
    clearUserCache();
    const { error } = await requestSignOut();
    return { error };
  }, []);

  return {
    session,
    user,
    loading,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    reauthenticatePasswordChange,
    signOut: logout,
  };
}
