import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
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
import { disableCurrentPushDeviceBeforeSignOut } from '../services/pushNotificationService';
import { clearTextOutbox } from '../services/textOutboxService';
import { clearPendingFriendInviteToken } from '../lib/pendingFriendInvite';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  error: Error | null;
};


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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await disableCurrentPushDeviceBeforeSignOut().catch((error) => {
    console.warn('Push device unregister before sign-out failed', error);
  });
  if (user) {
    await clearTextOutbox(user.id).catch((error) => {
      console.warn('Text outbox cleanup before sign-out failed', error);
    });
  }
  await clearPendingFriendInviteToken();
  clearUserCache();
  const { error } = await requestSignOut();
  return { error };
}

type AuthContextValue = AuthState & {
  signIn: typeof signIn;
  signInWithGoogle: typeof signInWithGoogle;
  signInWithApple: typeof signInWithApple;
  signUp: typeof signUp;
  verifyOTP: typeof verifyOTP;
  requestPasswordReset: typeof requestPasswordReset;
  updatePassword: typeof updatePassword;
  reauthenticatePasswordChange: typeof reauthenticatePasswordChange;
  signOut: typeof logout;
  retryBootstrap: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const previousUserIdRef = useRef<string | null>(null);
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let mounted = true;
    let authEventVersion = 0;
    const bootstrapVersion = authEventVersion;

    supabase.auth.getSession().then(({ data: { session: nextSession } }) => {
      if (!mounted || authEventVersion !== bootstrapVersion) return;
      previousUserIdRef.current = nextSession?.user.id ?? null;
      setState({ session: nextSession, user: nextSession?.user ?? null, loading: false, error: null });
    }).catch((err) => {
      console.warn('getSession error:', err);
      if (!mounted) return;
      setState({ session: null, user: null, loading: false, error: err instanceof Error ? err : new Error('Auth bootstrap failed') });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      authEventVersion += 1;
      const previousUserId = previousUserIdRef.current;
      const nextUserId = nextSession?.user.id ?? null;
      if (previousUserId && previousUserId !== nextUserId) {
        void clearTextOutbox(previousUserId);
        void clearPendingFriendInviteToken();
      }
      if (previousUserId !== nextUserId) {
        clearUserCache();
        queryClient.clear();
      }
      previousUserIdRef.current = nextUserId;
      setState({ session: nextSession, user: nextSession?.user ?? null, loading: false, error: null });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const retryBootstrap = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setState({ session, user: session?.user ?? null, loading: false, error: null });
    } catch (error) {
      setState({ session: null, user: null, loading: false, error: error instanceof Error ? error : new Error('Auth bootstrap failed') });
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    signIn,
    signInWithGoogle,
    signInWithApple,
    signUp,
    verifyOTP,
    requestPasswordReset,
    updatePassword,
    reauthenticatePasswordChange,
    signOut: logout,
    retryBootstrap,
  }), [retryBootstrap, state]);

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
