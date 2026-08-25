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
