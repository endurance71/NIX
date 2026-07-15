import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifySentry } from './http';

describe('Edge Sentry hard-off', () => {
  afterEach(() => vi.restoreAllMocks());

  it('nie wykonuje requestu nawet gdy wywołanie zgłasza błąd produkcyjny', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await notifySentry('moderation.failure', { report_id: 'report-1' }, 'error');

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
