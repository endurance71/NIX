import { notifySentry } from './http.ts';

Deno.test('Sentry hard-off prevents Edge Function transport', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = ((..._args: Parameters<typeof fetch>) => {
    fetchCalled = true;
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as typeof fetch;

  try {
    await notifySentry('moderation.failure', { report_id: 'report-1' }, 'error');
    if (fetchCalled) throw new Error('Sentry transport was called while hard-off is active');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
