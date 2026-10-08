import { describe, expect, it } from 'vitest';
import { getPasswordFormDecision } from './passwordForm';

const valid = {
  currentPassword: 'old',
  newPassword: 'Password1',
  confirmPassword: 'Password1',
  nonce: '',
  requiresNonce: false,
  loading: false,
};
describe('password form decisions', () => {
  it('prioritizes current password, strength, confirmation and nonce errors', () => {
    expect(
      getPasswordFormDecision({ ...valid, currentPassword: '', newPassword: '' }, true)
        .validationError,
    ).toBe('profile.currentPasswordRequired');
    for (const password of ['Short1', 'password1', 'PASSWORD1', 'Password']) {
      expect(
        getPasswordFormDecision({ ...valid, newPassword: password }, true).validationError,
      ).toBe('profile.passwordRequirementsError');
    }
    expect(getPasswordFormDecision({ ...valid, confirmPassword: '' }, true).validationError).toBe(
      'profile.passwordMismatchError',
    );
    expect(
      getPasswordFormDecision({ ...valid, requiresNonce: true, nonce: '  ' }, true).validationError,
    ).toBe('profile.verificationCodeRequired');
  });
  it('blocks valid submissions while offline or busy and accepts a trimmed verification code', () => {
    expect(getPasswordFormDecision(valid, true).isSubmitDisabled).toBe(false);
    expect(getPasswordFormDecision(valid, false).isSubmitDisabled).toBe(true);
    expect(getPasswordFormDecision({ ...valid, loading: true }, true).isSubmitDisabled).toBe(true);
    expect(
      getPasswordFormDecision({ ...valid, requiresNonce: true, nonce: ' 123 ' }, true)
        .isSubmitDisabled,
    ).toBe(false);
  });
});
