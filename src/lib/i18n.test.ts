import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError, toDomainError } from '../services/errors';

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'pl' }],
}));

describe('i18n', () => {
  let i18nModule: typeof import('./i18n');

  beforeEach(async () => {
    i18nModule = await import('./i18n');
    await i18nModule.default.changeLanguage('pl');
  });

  it('fallbackuje do en dla nieznanego języka', async () => {
    await i18nModule.default.changeLanguage('de');
    expect(i18nModule.default.t('tabs.camera')).toBe('Camera');
  });

  it('tłumaczy statusy skrzynki zależnie od języka', async () => {
    expect(i18nModule.default.t('inbox.cleaned')).toBe('Usunięto');

    await i18nModule.default.changeLanguage('en');
    expect(i18nModule.default.t('inbox.cleaned')).toBe('Deleted');
  });

  it('odmienia podsumowanie oczekujących zaproszeń w profilu', async () => {
    expect(i18nModule.default.t('profile.socialSummaryPendingInvites', { count: 1 })).toBe(
      '1 oczekujące zaproszenie'
    );
    expect(i18nModule.default.t('profile.socialSummaryPendingInvites', { count: 5 })).toBe(
      '5 oczekujących zaproszeń'
    );

    await i18nModule.default.changeLanguage('en');
    expect(i18nModule.default.t('profile.socialSummaryPendingInvites', { count: 1 })).toBe(
      '1 pending invite'
    );
    expect(i18nModule.default.t('profile.socialSummaryPendingInvites', { count: 2 })).toBe(
      '2 pending invites'
    );
  });

  it('udostępnia przyjazne teksty formularza resetu w obu językach', async () => {
    expect(i18nModule.default.t('auth.forgotPasswordDescription')).toBe(
      'Podaj adres e-mail. Wyślemy Ci link do ustawienia nowego hasła.'
    );
    expect(i18nModule.default.t('auth.forgotPasswordSubmit')).toBe('Wyślij link');

    await i18nModule.default.changeLanguage('en');
    expect(i18nModule.default.t('auth.forgotPasswordDescription')).toBe(
      'Enter your email address. We will send you a link to set a new password.'
    );
    expect(i18nModule.default.t('auth.forgotPasswordSubmit')).toBe('Send link');
  });

  it('udostępnia etykiety pól logowania w obu językach', async () => {
    expect(i18nModule.default.t('auth.emailLabel')).toBe('E-mail');
    expect(i18nModule.default.t('auth.passwordLabel')).toBe('Hasło');

    await i18nModule.default.changeLanguage('en');
    expect(i18nModule.default.t('auth.emailLabel')).toBe('Email');
    expect(i18nModule.default.t('auth.passwordLabel')).toBe('Password');
  });

  it('mapuje DomainError na klucz tłumaczenia', () => {
    const err = new DomainError('UNAUTHORIZED', 'Brak autoryzacji.');
    expect(err.messageKey).toBe('domainErrors.UNAUTHORIZED');
    expect(toDomainError(err, 'fallback').code).toBe('UNAUTHORIZED');
  });
});
