import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError, toDomainError } from '../services/errors';

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'pl' }],
}));

describe('i18n', () => {
  let i18nModule: typeof import('./i18n');
  let sentLifecycleSegments: typeof import('./nixInboxLabels').sentLifecycleSegments;

  beforeEach(async () => {
    i18nModule = await import('./i18n');
    ({ sentLifecycleSegments } = await import('./nixInboxLabels'));
    await i18nModule.default.changeLanguage('pl');
  });

  it('fallbackuje do en dla nieznanego języka', async () => {
    await i18nModule.default.changeLanguage('de');
    expect(i18nModule.default.t('tabs.camera')).toBe('Camera');
  });

  it('tłumaczy statusy skrzynki zależnie od języka', async () => {
    const valuePl = sentLifecycleSegments(
      { status: 'cleaned', viewed_at: null, cleaned_at: '2026-01-01' },
      (key) => i18nModule.default.t(key)
    );
    expect(valuePl).toContain('Usunięte');

    await i18nModule.default.changeLanguage('en');
    const valueEn = sentLifecycleSegments(
      { status: 'cleaned', viewed_at: null, cleaned_at: '2026-01-01' },
      (key) => i18nModule.default.t(key)
    );
    expect(valueEn).toContain('Deleted');
  });

  it('mapuje DomainError na klucz tłumaczenia', () => {
    const err = new DomainError('UNAUTHORIZED', 'Brak autoryzacji.');
    expect(err.messageKey).toBe('domainErrors.UNAUTHORIZED');
    expect(toDomainError(err, 'fallback').code).toBe('UNAUTHORIZED');
  });
});
