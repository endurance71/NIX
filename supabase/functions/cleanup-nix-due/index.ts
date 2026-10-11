import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { json } from '../_shared/http.ts';
import { hasServiceRoleBearer } from '../_shared/service-auth.ts';
import { cleanupCanonicalNix } from '../_shared/nix-cleanup.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'SERVER_CONFIG_MISSING' }, 500);
  if (!hasServiceRoleBearer(req, serviceKey)) return json({ error: 'AUTH_REQUIRED' }, 401);
  const service = createClient(url, serviceKey);
  const { data, error } = await service.from('nix_cleanup_queue').select('nix_id')
    .lte('next_attempt_at', new Date().toISOString()).order('next_attempt_at').limit(100);
  if (error) return json({ error: 'CLEANUP_QUEUE_FAILED' }, 500);
  let cleanedCount = 0;
  for (const item of data ?? []) {
    try {
      await cleanupCanonicalNix(service, item.nix_id);
      cleanedCount += 1;
    } catch {
      const { error: retryError } = await service.rpc('finish_nix_cleanup', {
        p_nix_id: item.nix_id, p_removed: false, p_error: 'CLEANUP_RETRY',
      });
      if (retryError) return json({ error: 'CLEANUP_RETRY_WRITE_FAILED' }, 500);
    }
  }
  return json({ ok: true, cleanedCount });
});
