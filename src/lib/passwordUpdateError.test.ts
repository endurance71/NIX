import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPasswordUpdateErrorKey } from './passwordUpdateError';

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'pl' }],
}));

describe('password update error localization', () => {
  let i18n: typeof import('./i18n').default;

  beforeEach(async () => {
    i18n = (await import('./i18n')).default;
    await i18n.changeLanguage('pl');
  });

  it.each([
    { code: 'same_password', message: 'New password should be different from the old password.' },
    { message: 'New password should be different from the old password.' },
    { message: 'The same password cannot be used again.' },
    { code: 'same_password', message: 'Server wording changed' },
  ])('localizes reused passwords with and without an Auth code: %j', async (error) => {
    const key = getPasswordUpdateErrorKey(error);
    expect(i18n.t(key)).toBe('Nowe hasło musi różnić się od poprzedniego.');
    await i18n.changeLanguage('en');
    expect(i18n.t(key)).toBe('New password must be different from the previous one.');
  });

  it.each([
    ['weak_password', 'profile.passwordRequirementsError'],
    ['email_not_confirmed', 'profile.emailNotConfirmedError'],
    ['reauthentication_not_valid', 'profile.invalidCodeError'],
    ['reauth_nonce_missing', 'profile.verificationCodeRequired'],
    ['invalid_credentials', 'profile.currentPasswordInvalidError'],
  ])('uses structured %s before legacy wording', (code, key) => {
    expect(getPasswordUpdateErrorKey({ code, message: 'same password' })).toBe(key);
    expect(i18n.t(key)).not.toBe(key);
  });

  it.each([
    ['Password should be at least 8 characters.', 'auth.passwordMin'],
    ['Email not confirmed', 'profile.emailNotConfirmedError'],
    ['Invalid nonce', 'profile.invalidCodeError'],
    ['Invalid login credentials', 'profile.currentPasswordInvalidError'],
    ['Incorrect password', 'profile.currentPasswordInvalidError'],
  ])('preserves localization for legacy responses: %s', (message, key) => {
    expect(getPasswordUpdateErrorKey({ message })).toBe(key);
  });

  it('shows a localized fallback instead of an unknown backend message', async () => {
    const key = getPasswordUpdateErrorKey({ code: 'unexpected_failure', message: 'Private server detail' });
    expect(i18n.t(key)).toBe('Nie udało się zapisać hasła. Spróbuj ponownie.');
    await i18n.changeLanguage('en');
    expect(i18n.t(key)).toBe('Could not save the password. Please try again.');
    expect(getPasswordUpdateErrorKey({})).toBe(key);
  });
});
