import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { SUPABASE_AUTH_STORAGE_KEY, supabase } from '../lib/supabase';
import { authStorage, isSessionAccessTokenExpired, readPersistedSessionCandidate } from '../lib/authStorage';
import {
  authStatusForResult,
  classifyAuthBootstrap,
  type AuthBootstrapResult,
  type AuthStatus,
} from '../lib/authBootstrap';
import { clearUserCache } from '../services/profileService';
import {
  signInWithPassword as requestPasswordSignIn,
  signUpWithPassword as requestPasswordSignUp,
  requestPasswordReset as requestPasswordResetEmail,
  updatePassword as requestPasswordUpdate,
  reauthenticatePasswordChange as requestPasswordReauthenticate,
  signOut as requestSignOut,
} from '../services/authService';
import { signInWithApple as requestAppleSignIn } from '../services/socialAuthService';
import { getCurrentLocale } from '../lib/i18n';
import { disableCurrentPushDeviceBeforeSignOut } from '../services/pushNotificationService';
import { clearTextOutbox } from '../services/textOutboxService';
import { clearPendingFriendInviteToken } from '../lib/pendingFriendInvite';
import { nowMs, trackDuration, trackEvent } from '../lib/telemetry';
import { setReactQueryAuthOnline } from '../lib/reactQueryNetwork';
import { clearRecipientSnapshot } from '../lib/recipientSnapshot';
import { clearProfileBootstrapSnapshot } from '../lib/profileBootstrapSnapshot';
import { clearOfflineCache } from '../lib/offlineCacheStore';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  error: Error | null;
  status: AuthStatus;
  lastBootstrapResult: AuthBootstrapResult['category'] | null;
};


async function signIn(email: string, password: string) {
  const { data, error } = await requestPasswordSignIn(email, password);
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

async function cleanupBeforeLogout(user: User | null) {
  await disableCurrentPushDeviceBeforeSignOut().catch((error) => {
    console.warn('Push device unregister before sign-out failed', error);
  });
  if (user) {
    await clearTextOutbox(user.id).catch((error) => {
      console.warn('Text outbox cleanup before sign-out failed', error);
    });
    await clearRecipientSnapshot(user.id).catch(() => undefined);
    await clearOfflineCache(user.id).catch((error) => {
      console.warn('Offline cache cleanup before sign-out failed', error);
    });
  }
  await clearPendingFriendInviteToken().catch(() => undefined);
  clearUserCache();
}

type AuthContextValue = AuthState & {
  signIn: typeof signIn;
  signInWithApple: typeof signInWithApple;
  signUp: typeof signUp;
  verifyOTP: typeof verifyOTP;
  requestPasswordReset: typeof requestPasswordReset;
  updatePassword: typeof updatePassword;
  reauthenticatePasswordChange: typeof reauthenticatePasswordChange;
  signOut: () => Promise<{ error: Error | null }>;
  retryBootstrap: () => Promise<AuthBootstrapResult>;
  isOfflineAuthenticated: boolean;
  canUseNetworkSession: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const previousUserIdRef = useRef<string | null>(null);
  const localSessionRef = useRef<Session | null>(null);
  const authStatusRef = useRef<AuthStatus>('initializing');
  const operationVersionRef = useRef(0);
  const bootstrapPendingRef = useRef(true);
  const networkOnlineRef = useRef(true);
  const reportedBootstrapFailuresRef = useRef(new Set<string>());
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
    error: null,
    status: 'initializing',
    lastBootstrapResult: null,
  });

  const commitSessionState = useCallback((
    session: Session | null,
    status: AuthStatus,
    error: Error | null,
    lastBootstrapResult: AuthBootstrapResult['category'] | null
  ) => {
    const previousUserId = previousUserIdRef.current;
    const nextUserId = session?.user.id ?? null;
    const identityChanged = status === 'anonymous'
      || (nextUserId !== null && previousUserId !== nextUserId);
    if (identityChanged && previousUserId && previousUserId !== nextUserId) {
      void clearTextOutbox(previousUserId);
      void clearOfflineCache(previousUserId);
      void clearPendingFriendInviteToken();
      if (nextUserId !== null || status === 'anonymous') {
        void clearRecipientSnapshot(previousUserId);
        void clearProfileBootstrapSnapshot(previousUserId);
      }
    }
    if (identityChanged && previousUserId !== nextUserId) {
      clearUserCache();
      queryClient.clear();
    }
    if (identityChanged) previousUserIdRef.current = nextUserId;
    localSessionRef.current = session;
    authStatusRef.current = status;
    setReactQueryAuthOnline(status === 'authenticatedOnline');
    setState({
      session,
      user: session?.user ?? null,
      loading: status === 'initializing',
      error,
      status,
      lastBootstrapResult,
    });
  }, [queryClient]);

  const performBootstrap = useCallback(async (
    trigger: 'initial' | 'retry' | 'network'
  ): Promise<AuthBootstrapResult> => {
    const operationVersion = ++operationVersionRef.current;
    const startedAt = nowMs();
    bootstrapPendingRef.current = true;
    const reportFailure = (stage: string, category: AuthBootstrapResult['category']) => {
      const key = `${trigger}:${stage}:${category}`;
      if (reportedBootstrapFailuresRef.current.has(key)) return;
      reportedBootstrapFailuresRef.current.add(key);
      trackEvent('auth_bootstrap_failure', {
        trigger,
        stage,
        result: category,
        network_online: networkOnlineRef.current,
      });
    };
    if (trigger !== 'network') {
      setState((current) => ({
        ...current,
        loading: true,
        error: null,
        status: 'initializing',
      }));
    }

    let localSession: Session | null;
    try {
      localSession = await readPersistedSessionCandidate(SUPABASE_AUTH_STORAGE_KEY);
      localSessionRef.current = localSession;
    } catch (cause) {
      const result: AuthBootstrapResult = { category: 'storage_error', session: null };
      if (operationVersion === operationVersionRef.current) {
        bootstrapPendingRef.current = false;
        const preservedSession = localSessionRef.current;
        commitSessionState(
          preservedSession,
          'recoverableError',
          cause instanceof Error ? cause : new Error('Auth storage failed'),
          result.category
        );
      }
      trackDuration('auth_bootstrap', startedAt, {
        trigger,
        result: result.category,
        stage: 'storage',
        stored_session_present: false,
      });
      reportFailure('storage', result.category);
      return result;
    }

    try {
      const netInfo = await NetInfo.fetch().catch(() => null);
      if (netInfo) {
        networkOnlineRef.current = netInfo.isConnected !== false && netInfo.isInternetReachable !== false;
      }
      const { data, error } = await supabase.auth.getSession();
      const result = classifyAuthBootstrap({
        localSession,
        resolvedSession: data.session,
        error,
        online: networkOnlineRef.current,
      });
      if (operationVersion === operationVersionRef.current) {
        bootstrapPendingRef.current = false;
        const resultSession = result.session;
        if (resultSession) localSessionRef.current = resultSession;
        commitSessionState(
          resultSession,
          authStatusForResult(result),
          result.category === 'unknown_error'
            ? error instanceof Error ? error : new Error('Auth bootstrap failed')
            : null,
          result.category
        );
      }
      trackDuration('auth_bootstrap', startedAt, {
        trigger,
        result: result.category,
        stage: 'session',
        stored_session_present: Boolean(localSession),
        access_token_expired: localSession ? isSessionAccessTokenExpired(localSession) : false,
        network_online: networkOnlineRef.current,
      });
      if (result.category === 'unknown_error' || result.category === 'invalid_session') {
        reportFailure('session', result.category);
      }
      return result;
    } catch (cause) {
      const result: AuthBootstrapResult = { category: 'storage_error', session: null };
      if (operationVersion === operationVersionRef.current) {
        bootstrapPendingRef.current = false;
        const preservedSession = localSession ?? localSessionRef.current;
        commitSessionState(
          preservedSession,
          'recoverableError',
          cause instanceof Error ? cause : new Error('Auth bootstrap failed'),
          result.category
        );
      }
      trackDuration('auth_bootstrap', startedAt, {
        trigger,
        result: result.category,
        stage: 'session_storage',
        stored_session_present: Boolean(localSession),
        network_online: networkOnlineRef.current,
      });
      reportFailure('session_storage', result.category);
      return result;
    }
  }, [commitSessionState]);

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (event === 'INITIAL_SESSION' && bootstrapPendingRef.current) {
        return;
      }
      if (event === 'INITIAL_SESSION' && !nextSession) {
        // Supabase emits this shape for both an empty store and a retryable refresh
        // failure. The explicit bootstrap owns that distinction.
        if (bootstrapPendingRef.current || localSessionRef.current) return;
      }
      operationVersionRef.current += 1;
      bootstrapPendingRef.current = false;
      if (nextSession) {
        localSessionRef.current = nextSession;
        commitSessionState(
          nextSession,
          networkOnlineRef.current ? 'authenticatedOnline' : 'authenticatedOffline',
          null,
          networkOnlineRef.current ? 'online' : 'offline_retryable'
        );
      } else if (event === 'SIGNED_OUT') {
        localSessionRef.current = null;
        commitSessionState(null, 'anonymous', null, 'invalid_session');
      }
      trackEvent('auth_state_transition', {
        auth_event: event,
        has_session: Boolean(nextSession),
        network_online: networkOnlineRef.current,
      });
    });

    const networkSubscription = NetInfo.addEventListener((networkState) => {
      if (!mounted) return;
      const online = networkState.isConnected !== false && networkState.isInternetReachable !== false;
      const wasOnline = networkOnlineRef.current;
      networkOnlineRef.current = online;
      const currentSession = localSessionRef.current;
      if (!online && currentSession && authStatusRef.current === 'authenticatedOnline') {
        commitSessionState(currentSession, 'authenticatedOffline', null, 'offline_retryable');
      } else if (online && !wasOnline && authStatusRef.current === 'authenticatedOffline') {
        void performBootstrap('network');
      }
    });

    void performBootstrap('initial');

    return () => {
      mounted = false;
      subscription.unsubscribe();
      networkSubscription();
    };
  }, [commitSessionState, performBootstrap]);

  const retryBootstrap = useCallback(
    () => performBootstrap('retry'),
    [performBootstrap]
  );

  const logout = useCallback(async () => {
    operationVersionRef.current += 1;
    const sessionBeforeLogout = localSessionRef.current;
    const user = sessionBeforeLogout?.user ?? null;
    await cleanupBeforeLogout(user);
    let signOutError: Error | null = null;
    try {
      const { error } = await requestSignOut();
      signOutError = error instanceof Error ? error : null;
    } catch (cause) {
      signOutError = cause instanceof Error ? cause : new Error('Sign-out failed');
    }
    let storageError: Error | null = null;
    try {
      await authStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
    } catch (cause) {
      storageError = cause instanceof Error ? cause : new Error('Auth storage cleanup failed');
    }
    if (storageError) {
      commitSessionState(sessionBeforeLogout, 'recoverableError', storageError, 'storage_error');
    } else {
      localSessionRef.current = null;
      commitSessionState(null, 'anonymous', null, 'anonymous');
    }
    return { error: signOutError ?? storageError };
  }, [commitSessionState]);

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    signIn,
    signInWithApple,
    signUp,
    verifyOTP,
    requestPasswordReset,
    updatePassword,
    reauthenticatePasswordChange,
    signOut: logout,
    retryBootstrap,
    isOfflineAuthenticated: state.status === 'authenticatedOffline',
    canUseNetworkSession: state.status === 'authenticatedOnline',
  }), [logout, retryBootstrap, state]);

  // Context callbacks only read refs after invocation; the provider does not expose a ref value.
  // eslint-disable-next-line react-hooks/refs
  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
