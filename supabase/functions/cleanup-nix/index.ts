import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { corsHeaders, getBearerToken, json } from '../_shared/http.ts';
import { cleanupCanonicalNix } from '../_shared/nix-cleanup.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'SERVER_CONFIG_MISSING' }, 500);
  const token = getBearerToken(req);
  if (!token) return json({ error: 'AUTH_REQUIRED' }, 401);
  let payload: { nixId?: unknown };
  try { payload = await req.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
  if (typeof payload?.nixId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.nixId)) {
    return json({ error: 'INVALID_NIX_ID' }, 400);
  }
  const auth = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError || !user) return json({ error: 'AUTH_REQUIRED' }, 401);
  const { error } = await auth.rpc('request_nix_cleanup', { p_nix_id: payload.nixId });
  if (error) return json({ error: error.message }, error.message.includes('REPLAY_WINDOW_ACTIVE') ? 409 : 403);
  try {
    const result = await cleanupCanonicalNix(createClient(url, serviceKey), payload.nixId);
    return json({ ok: true, ...result });
  } catch {
    // The authenticated RPC durably queued retry before any Storage operation.
    return json({ error: 'CLEANUP_RETRY', queued: true }, 503);
  }
});
