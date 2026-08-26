import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';
import { json, notifySentry } from '../_shared/http.ts';
import { hasServiceRoleBearer } from '../_shared/service-auth.ts';
import { parseCleanupDryRun, summarizeEvidenceOrphans, type EvidenceOrphan } from './contract.ts';

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

  let parsedBody: unknown = null;
  try {
    parsedBody = await req.json();
  } catch {
    parsedBody = null;
  }
  const dryRun = parseCleanupDryRun(parsedBody, req.headers.get('x-dry-run'));

  const { count: missingExpiryCount, error: missingExpiryError } = await serviceClient
    .from('content_reports')
    .select('id', { count: 'exact', head: true })
    .not('evidence_path', 'is', null)
    .is('evidence_expires_at', null);
  if (missingExpiryError) return json({ error: missingExpiryError.message }, 500);
  if ((missingExpiryCount ?? 0) > 0) {
    await notifySentry(
      'moderation.evidence.missing_expiry',
      { count: String(missingExpiryCount) },
      'error'
    );
  }

  const { data: expired, error } = await serviceClient
    .from('content_reports')
    .select('id, evidence_path')
    .not('evidence_path', 'is', null)
    .is('evidence_deleted_at', null)
    .lte('evidence_expires_at', now)
    .limit(200);
  if (error) return json({ error: error.message }, 500);

  const expiredPaths = (expired ?? [])
    .map((row) => row.evidence_path)
    .filter((path): path is string => Boolean(path));

  const { data: orphanRows, error: orphanError } = await serviceClient.rpc(
    'list_moderation_evidence_orphans'
  );
  if (orphanError) return json({ error: orphanError.message }, 500);
  const orphans = summarizeEvidenceOrphans((orphanRows ?? []) as EvidenceOrphan[]);

  if (dryRun) {
    return json({
      ok: true,
      dryRun: true,
      expiredEvidenceCount: expiredPaths.length,
      deletedEvidenceCount: 0,
      orphanCount: orphans.orphanCount,
      eligibleOrphanCount: orphans.eligibleOrphanCount,
      deletedOrphanCount: 0,
      skippedYoungOrphanCount: orphans.skippedYoungOrphanCount,
      missingExpiryCount: missingExpiryCount ?? 0,
    });
  }

  if (expiredPaths.length) {
    const { error: removeError } = await serviceClient.storage.from('moderation-evidence').remove(expiredPaths);
    if (removeError) {
      await notifySentry('moderation.evidence.cleanup_failed', { count: String(expiredPaths.length) }, 'error');
      return json({ error: removeError.message }, 500);
    }
    const ids = (expired ?? []).map((row) => row.id);
    const { error: updateError } = await serviceClient
      .from('content_reports')
      .update({ evidence_deleted_at: now, evidence_path: null })
      .in('id', ids);
    if (updateError) return json({ error: updateError.message }, 500);
  }

  if (orphans.eligibleNames.length) {
    const { error: orphanRemoveError } = await serviceClient.storage
      .from('moderation-evidence')
      .remove(orphans.eligibleNames);
    if (orphanRemoveError) {
      await notifySentry(
        'moderation.evidence.orphan_cleanup_failed',
        { count: String(orphans.eligibleNames.length) },
        'error'
      );
      return json({ error: orphanRemoveError.message }, 500);
    }
  }

  const metadataCutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const { error: retentionError } = await serviceClient
    .from('content_reports')
    .delete()
    .not('resolved_at', 'is', null)
    .lt('resolved_at', metadataCutoff)
    .in('status', ['actioned', 'dismissed']);
  if (retentionError) return json({ error: retentionError.message }, 500);

  return json({
    ok: true,
    dryRun: false,
    expiredEvidenceCount: expiredPaths.length,
    deletedEvidenceCount: expiredPaths.length,
    orphanCount: orphans.orphanCount,
    eligibleOrphanCount: orphans.eligibleOrphanCount,
    deletedOrphanCount: orphans.eligibleNames.length,
    skippedYoungOrphanCount: orphans.skippedYoungOrphanCount,
    missingExpiryCount: missingExpiryCount ?? 0,
  });
});
