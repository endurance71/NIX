import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';
import { json, notifySentry } from '../_shared/http.ts';
import { hasServiceRoleBearer } from '../_shared/service-auth.ts';
import { readAdminAction, readReportId, statusForRemoveRpcError } from './contract.ts';

type Decision = 'dismiss' | 'warning' | 'suspension' | 'ban';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!hasServiceRoleBearer(req, serviceRoleKey)) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const expectedSecret = Deno.env.get('MODERATOR_API_SECRET');
  if (!expectedSecret || req.headers.get('x-moderator-secret') !== expectedSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server is not configured' }, 500);
  const client = createClient(supabaseUrl, serviceRoleKey);

  let payload: Record<string, unknown>;
  try {
    const parsed = await req.json();
    payload = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return json({ error: 'Invalid JSON payload' }, 400);
  }

  const action = readAdminAction(payload);
  if (action === 'list') {
    const { data, error } = await client
      .from('content_reports')
      .select('id, reported_user_id, reason, details, status, priority, evidence_path, created_at')
      .in('status', ['open', 'in_review', 'escalated', 'evidence_failed'])
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) return json({ error: error.message }, 500);

    const reports = await Promise.all(
      (data ?? []).map(async (report) => {
        if (!report.evidence_path) return { ...report, evidenceUrl: null };
        const { data: signed } = await client.storage
          .from('moderation-evidence')
          .createSignedUrl(report.evidence_path, 600);
        return { ...report, evidenceUrl: signed?.signedUrl ?? null };
      })
    );
    return json({ reports });
  }

  if (action === 'remove') {
    const reportId = readReportId(payload);
    if (!reportId) return json({ error: 'reportId is required' }, 400);
    const { error: removeError } = await client.rpc('moderation_remove_reported_content', {
      p_report_id: reportId,
    });
    if (removeError) {
      return json({ error: removeError.message }, statusForRemoveRpcError(removeError.message));
    }
    await notifySentry('moderation.report.content_removed', { report_id: reportId }, 'info');
    return json({ ok: true });
  }

  if (action === 'appeal') {
    const reportId = readReportId(payload);
    const appealOutcome = payload.appealOutcome;
    const note = typeof payload.note === 'string' ? payload.note : '';
    if (!reportId || (appealOutcome !== 'upheld' && appealOutcome !== 'action_revoked') || !note.trim()) {
      return json({ error: 'reportId, appealOutcome, and note are required' }, 400);
    }
    const { error: appealError } = await client.rpc('moderation_record_appeal', {
      p_report_id: reportId,
      p_outcome: appealOutcome,
      p_note: note.trim(),
    });
    if (appealError) return json({ error: appealError.message }, 400);
    await notifySentry(
      'moderation.appeal.resolved',
      { report_id: reportId, outcome: appealOutcome },
      'info'
    );
    return json({ ok: true });
  }

  const reportId = readReportId(payload);
  const decision = payload.decision;
  if (action !== 'decide' || !reportId || typeof decision !== 'string') {
    return json({ error: 'A valid action, reportId, and decision are required' }, 400);
  }
  const note = typeof payload.note === 'string' ? payload.note : '';
  if (note.length > 1000) return json({ error: 'Note is too long' }, 400);
  const suspensionHours = typeof payload.suspensionHours === 'number' ? payload.suspensionHours : null;
  if (decision === 'suspension' && (!suspensionHours || suspensionHours < 1)) {
    return json({ error: 'suspensionHours is required for a suspension' }, 400);
  }

  const { error: decisionError } = await client.rpc('moderation_decide_report', {
    p_report_id: reportId,
    p_decision: decision as Decision,
    p_note: note.trim() || null,
    p_suspension_hours: suspensionHours,
  });
  if (decisionError) {
    const status = decisionError.message.includes('not found') ? 404
      : decisionError.message.includes('already resolved') ? 409
        : 400;
    return json({ error: decisionError.message }, status);
  }

  await notifySentry('moderation.report.resolved', { report_id: reportId, decision }, 'info');
  return json({ ok: true });
});
