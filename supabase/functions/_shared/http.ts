export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Temporary TestFlight policy. Keep the transport implementation available for
// a later, reviewed rollout, but do not allow a deployed secret to activate it.
const SENTRY_RUNTIME_ENABLED = false;

export function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function getBearerToken(req: Request) {
  const value = req.headers.get('Authorization') ?? req.headers.get('authorization');
  return value?.startsWith('Bearer ') ? value.slice(7).trim() : null;
}

export async function notifySentry(
  event: string,
  tags: Record<string, string>,
  level: 'info' | 'warning' | 'error' = 'info'
) {
  if (!SENTRY_RUNTIME_ENABLED) return;
  const dsnValue = Deno.env.get('SENTRY_DSN');
  if (!dsnValue) return;

  try {
    const dsn = new URL(dsnValue);
    const projectId = dsn.pathname.replace(/^\//, '');
    if (!projectId) return;
    const eventId = crypto.randomUUID().replaceAll('-', '');
    const header = {
      event_id: eventId,
      sent_at: new Date().toISOString(),
      dsn: dsnValue,
    };
    const item = { type: 'event', content_type: 'application/json' };
    const payload = {
      event_id: eventId,
      timestamp: new Date().toISOString(),
      platform: 'javascript',
      level,
      message: event,
      tags,
      environment: 'production',
    };
    const endpoint = `${dsn.protocol}//${dsn.host}/api/${projectId}/envelope/`;
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: `${JSON.stringify(header)}\n${JSON.stringify(item)}\n${JSON.stringify(payload)}`,
    });
  } catch (error) {
    console.warn('Sentry notification failed', error instanceof Error ? error.message : 'unknown');
  }
}
