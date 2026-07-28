import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';
import { corsHeaders, getBearerToken, json } from '../_shared/http.ts';

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
  const bearerToken = getBearerToken(req);
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: 'SERVER_CONFIG_MISSING', code: 'SERVER_CONFIG_MISSING' }, 500);
  }
  if (!bearerToken) return json({ error: 'AUTH_REQUIRED', code: 'AUTH_REQUIRED' }, 401);

  let payload: { batchId?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'INVALID_JSON', code: 'INVALID_JSON' }, 400);
  }
  if (!isUuid(payload.batchId)) return json({ error: 'INVALID_PAYLOAD', code: 'INVALID_PAYLOAD' }, 400);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'AUTH_REQUIRED', code: 'AUTH_REQUIRED' }, 401);

  const { data, error } = await serviceClient.rpc('cancel_media_upload_batch', {
    p_batch_id: payload.batchId,
    p_sender_id: userData.user.id,
  });
  if (error) {
    const code = error.message.match(/[A-Z][A-Z_]+/)?.[0] ?? 'CANCEL_FAILED';
    return json({ error: error.message, code }, code === 'BATCH_NOT_FOUND' ? 404 : 409);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (row?.storage_path) {
    await serviceClient.storage.from('media-vault').remove([row.storage_path]);
    await serviceClient
      .from('media_assets')
      .update({ status: 'deleted', deleted_at: new Date().toISOString() })
      .eq('id', row.asset_id);
  }
  return json({ ok: true });
});
