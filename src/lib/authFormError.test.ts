import { describe, expect, it } from 'vitest';

import { getAuthFormErrorKey } from './authFormError';

describe('getAuthFormErrorKey', () => {
  it('maps Auth error codes before message text', () => {
    expect(getAuthFormErrorKey({ code: 'user_already_exists', message: 'anything' })).toBe('auth.accountExists');
    expect(getAuthFormErrorKey({ code: 'over_email_send_rate_limit' })).toBe('auth.rateLimited');
    expect(getAuthFormErrorKey({ code: 'otp_expired' })).toBe('profile.invalidCodeError');
    expect(getAuthFormErrorKey({ code: 'USERNAME_TAKEN' })).toBe('auth.onboardingUsernameTaken');
  });

  it('keeps legacy wording localized', () => {
    expect(getAuthFormErrorKey({ message: 'Invalid login credentials' })).toBe('auth.invalidCredentials');
    expect(getAuthFormErrorKey({ message: 'User already registered' })).toBe('auth.accountExists');
    expect(getAuthFormErrorKey({ message: 'Token has expired or is invalid' })).toBe('profile.invalidCodeError');
  });

  it('never returns raw server text', () => {
    expect(getAuthFormErrorKey({ message: 'duplicate key value violates unique constraint' })).toBe('auth.requestFailed');
    expect(getAuthFormErrorKey(null)).toBe('auth.requestFailed');
  });
});
