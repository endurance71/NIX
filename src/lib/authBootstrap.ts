import {
  isAuthRefreshDiscardedError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
  type Session,
} from '@supabase/supabase-js';

export type AuthStatus =
  | 'initializing'
  | 'authenticatedOnline'
  | 'authenticatedOffline'
  | 'anonymous'
  | 'recoverableError';

export type AuthBootstrapResult =
  | { category: 'online'; session: Session }
  | { category: 'offline_retryable'; session: Session }
  | { category: 'anonymous'; session: null }
  | { category: 'invalid_session'; session: null }
  | { category: 'storage_error'; session: null }
  | { category: 'unknown_error'; session: Session | null };

export function isTransientAuthError(error: unknown) {
  return isAuthRetryableFetchError(error) || isAuthRefreshDiscardedError(error);
}

export function classifyAuthBootstrap(input: {
  localSession: Session | null;
  resolvedSession: Session | null;
  error: unknown;
  online: boolean;
}): AuthBootstrapResult {
  if (input.resolvedSession) {
    return input.online
      ? { category: 'online', session: input.resolvedSession }
      : { category: 'offline_retryable', session: input.resolvedSession };
  }
  if (!input.error) return { category: 'anonymous', session: null };
  if (input.localSession && isTransientAuthError(input.error)) {
    return { category: 'offline_retryable', session: input.localSession };
  }
  if (isAuthSessionMissingError(input.error)) {
    return { category: 'invalid_session', session: null };
  }
  if (input.localSession) {
    const status = typeof input.error === 'object' && input.error && 'status' in input.error
      ? Number(input.error.status)
      : 0;
    if (status >= 400 && status < 500) {
      return { category: 'invalid_session', session: null };
    }
    return { category: 'unknown_error', session: input.localSession };
  }
  return { category: 'unknown_error', session: null };
}

export function authStatusForResult(result: AuthBootstrapResult): AuthStatus {
  switch (result.category) {
    case 'online': return 'authenticatedOnline';
    case 'offline_retryable': return 'authenticatedOffline';
    case 'anonymous':
    case 'invalid_session': return 'anonymous';
    case 'storage_error':
    case 'unknown_error': return 'recoverableError';
  }
}

const OFFLINE_SESSION_LOOKUP_TIMEOUT_MS = 1_500;

type SessionLookupResponse = { data: { session: Session | null }; error: unknown };

/**
 * Offline with an expired token, auth-js keeps retrying the refresh for ~25 s before it gives up,
 * holding the splash the whole time. With a local session and no network we continue with that
 * session (classified as offline) right away; the reconnect bootstrap verifies it later.
 */
export async function lookupSessionWithOfflineFallback<TResponse extends SessionLookupResponse>(
  getSession: () => Promise<TResponse>,
  localSession: Session | null,
  online: boolean,
  timeoutMs = OFFLINE_SESSION_LOOKUP_TIMEOUT_MS
): Promise<TResponse | { data: { session: Session }; error: null }> {
  const sessionLookup = getSession();
  if (!localSession || online) return sessionLookup;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const offline = new Promise<{ data: { session: Session }; error: null }>((resolve) => {
    timer = setTimeout(() => resolve({ data: { session: localSession }, error: null }), timeoutMs);
  });
  void sessionLookup.catch(() => undefined);
  try {
    return await Promise.race([sessionLookup, offline]);
  } finally {
    clearTimeout(timer);
  }
}
