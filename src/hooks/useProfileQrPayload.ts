import { useEffect, useReducer, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { buildFriendInviteTokenLink } from '../lib/friendInvite';
import { createFriendInviteQrToken } from '../services/friendService';

export function useProfileQrPayload() {
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTokenRef = useRef<() => Promise<void>>(async () => {});
  const [state, dispatch] = useReducer(
    (
      current: { payload: string | null; loading: boolean; error: string | null },
      action:
        | { type: 'loading' }
        | { type: 'loaded'; payload: string; expiresAt: string }
        | { type: 'error'; error: string }
    ) => {
      switch (action.type) {
        case 'loading':
          return { ...current, loading: true, error: null };
        case 'loaded':
          return {
            payload: action.payload,
            loading: false,
            error: null,
          };
        case 'error':
          return { payload: null, loading: false, error: action.error };
        default:
          return current;
      }
    },
    { payload: null, loading: true, error: null }
  );

  const clearRefreshTimeout = () => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
  };

  const loadToken = async () => {
    clearRefreshTimeout();
    dispatch({ type: 'loading' });

    try {
      const invite = await createFriendInviteQrToken();
      const payload = buildFriendInviteTokenLink(invite.token);
      dispatch({ type: 'loaded', payload, expiresAt: invite.expiresAt });

      const expiresAtMs = new Date(invite.expiresAt).getTime();
      const refreshInMs = Math.max(15_000, expiresAtMs - Date.now() - 30_000);
      refreshTimeoutRef.current = setTimeout(() => {
        void loadTokenRef.current();
      }, refreshInMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udało się wygenerować kodu QR.';
      dispatch({ type: 'error', error: message });
    }
  };

  useEffect(() => {
    loadTokenRef.current = loadToken;
  });

  useFocusEffect(() => {
    void loadToken();
    return clearRefreshTimeout;
  });

  useEffect(() => {
    return () => clearRefreshTimeout();
  }, []);

  return {
    payload: state.payload,
    loading: state.loading,
    error: state.error,
    refresh: loadToken,
  };
}
