import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';
import { json, notifySentry } from '../_shared/http.ts';
import { hasServiceRoleBearer } from '../_shared/service-auth.ts';

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

  let payload: {
    action?: 'list' | 'decide' | 'appeal';
    reportId?: string;
    decision?: Decision;
    note?: string;
    suspensionHours?: number;
    appealOutcome?: 'upheld' | 'action_revoked';
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON payload' }, 400);
  }

  if (payload.action === 'list') {
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

  if (payload.action === 'appeal') {
    if (!payload.reportId || !payload.appealOutcome || !payload.note?.trim()) {
      return json({ error: 'reportId, appealOutcome, and note are required' }, 400);
    }
    const { error: appealError } = await client.rpc('moderation_record_appeal', {
      p_report_id: payload.reportId,
      p_outcome: payload.appealOutcome,
      p_note: payload.note.trim(),
    });
    if (appealError) return json({ error: appealError.message }, 400);
    await notifySentry(
      'moderation.appeal.resolved',
      { report_id: payload.reportId, outcome: payload.appealOutcome },
      'info'
    );
    return json({ ok: true });
  }

  if (payload.action !== 'decide' || !payload.reportId || !payload.decision) {
    return json({ error: 'A valid action, reportId, and decision are required' }, 400);
  }
  if (payload.note && payload.note.length > 1000) return json({ error: 'Note is too long' }, 400);
  if (payload.decision === 'suspension' && (!payload.suspensionHours || payload.suspensionHours < 1)) {
    return json({ error: 'suspensionHours is required for a suspension' }, 400);
  }

  const { error: decisionError } = await client.rpc('moderation_decide_report', {
    p_report_id: payload.reportId,
    p_decision: payload.decision,
    p_note: payload.note?.trim() || null,
    p_suspension_hours: payload.suspensionHours ?? null,
  });
  if (decisionError) {
    const status = decisionError.message.includes('not found') ? 404
      : decisionError.message.includes('already resolved') ? 409
        : 400;
    return json({ error: decisionError.message }, status);
  }

  await notifySentry('moderation.report.resolved', { report_id: payload.reportId, decision: payload.decision }, 'info');
  return json({ ok: true });
});
