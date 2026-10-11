import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { buildFriendInviteTokenLink } from '../lib/friendInvite';
import i18n from '../lib/i18n';
import { createFriendInviteQrToken } from '../services/friendService';
import { isNetworkError } from '../services/errors';

export function useProfileQrPayload(enabled = true) {
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTokenRef = useRef<() => Promise<void>>(async () => {});
  const [state, dispatch] = useReducer(
    (
      current: {
        payload: string | null;
        expiresAtMs: number | null;
        loading: boolean;
        error: string | null;
      },
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
            expiresAtMs: Number.isFinite(Date.parse(action.expiresAt))
              ? Date.parse(action.expiresAt)
              : null,
            loading: false,
            error: null,
          };
        case 'error':
          return { payload: null, expiresAtMs: null, loading: false, error: action.error };
        default:
          return current;
      }
    },
    { payload: null, expiresAtMs: null, loading: true, error: null }
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
      // Service errors carry internal (English) diagnostics; the UI always shows localized copy.
      const message = isNetworkError(error)
        ? i18n.t('notify.networkHint')
        : i18n.t('profile.qrGenerateFailed');
      dispatch({ type: 'error', error: message });
    }
  };

  useEffect(() => {
    loadTokenRef.current = loadToken;
  });

  useFocusEffect(
    useCallback(() => {
      if (enabled) void loadTokenRef.current();
      return clearRefreshTimeout;
    }, [enabled])
  );

  useEffect(() => {
    return () => clearRefreshTimeout();
  }, []);

  return {
    payload: state.payload,
    /** Expiry of the code currently on screen (kept while a background refresh runs). */
    expiresAtMs: state.expiresAtMs,
    loading: state.loading,
    error: state.error,
    refresh: loadToken,
  };
}
