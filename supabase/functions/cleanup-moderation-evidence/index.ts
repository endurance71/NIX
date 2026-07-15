import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';
import { json, notifySentry } from '../_shared/http.ts';
import { hasServiceRoleBearer } from '../_shared/service-auth.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!hasServiceRoleBearer(req, serviceRoleKey)) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const expectedSecret = Deno.env.get('MODERATION_CLEANUP_SECRET');
  if (!expectedSecret || req.headers.get('x-cleanup-secret') !== expectedSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server is not configured' }, 500);
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const now = new Date().toISOString();

  const { data: expired, error } = await serviceClient
    .from('content_reports')
    .select('id, evidence_path')
    .not('evidence_path', 'is', null)
    .is('evidence_deleted_at', null)
    .lte('evidence_expires_at', now)
    .limit(200);
  if (error) return json({ error: error.message }, 500);

  const paths = (expired ?? []).map((row) => row.evidence_path).filter((path): path is string => Boolean(path));
  if (paths.length) {
    const { error: removeError } = await serviceClient.storage.from('moderation-evidence').remove(paths);
    if (removeError) {
      await notifySentry('moderation.evidence.cleanup_failed', { count: String(paths.length) }, 'error');
      return json({ error: removeError.message }, 500);
    }
    const ids = (expired ?? []).map((row) => row.id);
    const { error: updateError } = await serviceClient
      .from('content_reports')
      .update({ evidence_deleted_at: now, evidence_path: null })
      .in('id', ids);
    if (updateError) return json({ error: updateError.message }, 500);
  }

  const metadataCutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const { error: retentionError } = await serviceClient
    .from('content_reports')
    .delete()
    .not('resolved_at', 'is', null)
    .lt('resolved_at', metadataCutoff)
    .in('status', ['actioned', 'dismissed']);
  if (retentionError) return json({ error: retentionError.message }, 500);

  return json({ ok: true, deletedEvidenceCount: paths.length });
});
