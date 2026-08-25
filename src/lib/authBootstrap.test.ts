import { describe, expect, it } from 'vitest';
import { AuthApiError, AuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { authStatusForResult, classifyAuthBootstrap } from './authBootstrap';

const session = {
  access_token: 'access', refresh_token: 'refresh', expires_at: 1,
  expires_in: 3600, token_type: 'bearer', user: { id: 'user-a' },
} as Session;

describe('auth bootstrap classification', () => {
  it('resolves an available session online or offline according to connectivity', () => {
    expect(classifyAuthBootstrap({ localSession: session, resolvedSession: session, error: null, online: true }).category).toBe('online');
    expect(classifyAuthBootstrap({ localSession: session, resolvedSession: session, error: null, online: false }).category).toBe('offline_retryable');
  });

  it('preserves a local session after a retryable refresh failure', () => {
    const result = classifyAuthBootstrap({
      localSession: session,
      resolvedSession: null,
      error: new AuthRetryableFetchError('offline', 0),
      online: false,
    });
    expect(result).toEqual({ category: 'offline_retryable', session });
    expect(authStatusForResult(result)).toBe('authenticatedOffline');
  });

  it('treats a rejected refresh token as an invalid session', () => {
    const result = classifyAuthBootstrap({
      localSession: session,
      resolvedSession: null,
      error: new AuthApiError('invalid refresh token', 400, 'refresh_token_not_found'),
      online: true,
    });
    expect(result.category).toBe('invalid_session');
    expect(authStatusForResult(result)).toBe('anonymous');
  });

  it('uses anonymous only for a clean empty storage result', () => {
    expect(classifyAuthBootstrap({ localSession: null, resolvedSession: null, error: null, online: false }).category).toBe('anonymous');
  });
});
