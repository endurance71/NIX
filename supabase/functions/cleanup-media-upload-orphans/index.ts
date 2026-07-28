import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';
import { json } from '../_shared/http.ts';
import { hasServiceRoleBearer } from '../_shared/service-auth.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED', code: 'METHOD_NOT_ALLOWED' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'SERVER_CONFIG_MISSING', code: 'SERVER_CONFIG_MISSING' }, 500);
  }
  if (!hasServiceRoleBearer(req, serviceRoleKey)) {
    return json({ error: 'AUTH_REQUIRED', code: 'AUTH_REQUIRED' }, 401);
  }
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await serviceClient.rpc('mark_expired_media_uploads');
  if (error) return json({ error: error.message, code: 'ORPHAN_QUERY_FAILED' }, 500);

  const rows = Array.isArray(data) ? data : [];
  const paths = rows.flatMap((row) =>
    typeof row?.storage_path === 'string' ? [row.storage_path] : []
  );
  if (paths.length > 0) {
    const { error: removeError } = await serviceClient.storage.from('media-vault').remove(paths);
    if (removeError) return json({ error: removeError.message, code: 'ORPHAN_DELETE_FAILED' }, 500);
    await serviceClient
      .from('media_assets')
      .update({ status: 'deleted', deleted_at: new Date().toISOString() })
      .in('id', rows.map((row) => row.asset_id));
  }
  return json({ ok: true, deleted: paths.length });
});
