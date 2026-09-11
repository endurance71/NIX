import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';
import { corsHeaders, getBearerToken, json } from '../_shared/http.ts';
import { hasServiceRoleBearer } from '../_shared/service-auth.ts';

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED', code: 'METHOD_NOT_ALLOWED' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: 'SERVER_CONFIG_MISSING', code: 'SERVER_CONFIG_MISSING' }, 500);
  }

  const bearer = getBearerToken(req);
  if (!bearer) return json({ error: 'AUTH_REQUIRED', code: 'UNAUTHORIZED' }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData.user) {
    return json({ error: 'AUTH_REQUIRED', code: 'UNAUTHORIZED' }, 401);
  }

  let payload: { receiverId?: unknown; body?: unknown; clientMessageId?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'INVALID_JSON', code: 'INVALID_JSON' }, 400);
  }

  if (!isUuid(payload.receiverId) || typeof payload.body !== 'string') {
    return json({ error: 'INVALID_PAYLOAD', code: 'INVALID_INPUT' }, 400);
  }

  const trimmedBody = payload.body.trim();
  if (!trimmedBody) return json({ error: 'EMPTY_BODY', code: 'INVALID_INPUT' }, 400);
  if (trimmedBody.length > 2000) return json({ error: 'BODY_TOO_LONG', code: 'INVALID_INPUT' }, 400);

  const clientMessageId = typeof payload.clientMessageId === 'string' && payload.clientMessageId.length > 0
    ? payload.clientMessageId
    : null;

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await serviceClient.rpc('enqueue_text_moderation_job', {
    p_sender_id: authData.user.id,
    p_receiver_id: payload.receiverId,
    p_body: trimmedBody,
    p_client_message_id: clientMessageId,
  });

  if (error) {
    const code = error.message.match(/[A-Z][A-Z_]+/)?.[0] ?? 'SEND_FAILED';
    if (code === 'NOT_FRIEND') return json({ error: error.message, code: 'NOT_FRIEND' }, 403);
    if (code === 'CONTENT_NOT_ALLOWED') {
      return json({ error: 'Content not allowed', code: 'CONTENT_NOT_ALLOWED' }, 422);
    }
    if (code === 'MODERATION_DISABLED') {
      return json({ error: 'Moderation disabled', code: 'MODERATION_DISABLED' }, 503);
    }
    return json({ error: error.message, code }, 400);
  }

  const status = typeof data?.status === 'string' ? data.status : 'pending';
  if (status === 'approved') {
    return json({ ok: true, status: 'approved', jobId: data?.jobId ?? null });
  }
  if (status === 'rejected') {
    return json({ error: 'Content not allowed', code: 'CONTENT_NOT_ALLOWED' }, 422);
  }
  if (status === 'error') {
    return json({ error: 'Moderation unavailable', code: 'MODERATION_RETRYABLE' }, 503);
  }

  return json({
    ok: true,
    status: 'moderation_pending',
    code: 'MODERATION_PENDING',
    jobId: data?.jobId ?? null,
  }, 202);
});
