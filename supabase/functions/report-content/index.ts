import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';
import { corsHeaders, getBearerToken, json, notifySentry } from '../_shared/http.ts';

const REPORT_REASONS = new Set([
  'sexual_content',
  'violence',
  'self_harm',
  'harassment',
  'hate',
  'impersonation',
  'spam',
  'privacy',
  'illegal_content',
  'other',
]);

function extensionFor(mediaPath: string, mediaType: string) {
  const raw = mediaPath.split('?')[0].split('.').pop()?.toLowerCase();
  if (raw && /^[a-z0-9]{2,5}$/.test(raw)) return raw;
  return mediaType === 'video' ? 'mp4' : 'jpg';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = getBearerToken(req);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Server is not configured' }, 500);
  if (!token) return json({ error: 'Missing bearer token' }, 401);

  let payload: { reason?: string; nixId?: string; textMessageId?: string; reportedUserId?: string; details?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON payload' }, 400);
  }
  if (!payload.reason || !REPORT_REASONS.has(payload.reason)) return json({ error: 'Invalid report reason' }, 400);
  if (!payload.nixId && !payload.textMessageId && !payload.reportedUserId) return json({ error: 'A message or user is required' }, 400);
  if (payload.details && payload.details.length > 500) return json({ error: 'Details are too long' }, 400);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  let reportedUserId = payload.reportedUserId ?? null;

  if (payload.textMessageId && !reportedUserId) {
    const { data: textMsg } = await serviceClient
      .from('text_messages')
      .select('sender_id')
      .eq('id', payload.textMessageId)
      .maybeSingle();
    if (textMsg?.sender_id) {
      reportedUserId = textMsg.sender_id;
    }
  }

  const { data, error } = await authClient.rpc('create_content_report', {
    p_reason: payload.reason,
    p_nix_id: payload.nixId ?? null,
    p_reported_user_id: reportedUserId,
    p_details: payload.details?.trim() || null,
  });
  if (error) {
    const status = error.message.includes('rate limit') ? 429 : 400;
    return json({ error: error.message }, status);
  }

  const report = Array.isArray(data) ? data[0] : data;
  if (!report?.report_id) return json({ error: 'Report was not created' }, 500);

  if (payload.textMessageId) {
    const { data: textMsg } = await serviceClient
      .from('text_messages')
      .select('id, sender_id, receiver_id, body, created_at')
      .eq('id', payload.textMessageId)
      .maybeSingle();

    if (textMsg) {
      const evidenceJson = JSON.stringify({
        textMessageId: textMsg.id,
        senderId: textMsg.sender_id,
        receiverId: textMsg.receiver_id,
        body: textMsg.body,
        createdAt: textMsg.created_at,
        reportedAt: new Date().toISOString(),
      });
      const evidencePath = `${report.report_id}/evidence.json`;
      const { error: uploadError } = await serviceClient.storage
        .from('moderation-evidence')
        .upload(evidencePath, new Blob([evidenceJson], { type: 'application/json' }), {
          contentType: 'application/json',
          upsert: true,
        });

      if (!uploadError) {
        await serviceClient
          .from('content_reports')
          .update({ evidence_path: evidencePath, status: 'open' })
          .eq('id', report.report_id);
      }
    }
  }

  if (report.media_path) {
    const { data: existing } = await serviceClient
      .from('content_reports')
      .select('evidence_path')
      .eq('id', report.report_id)
      .maybeSingle();

    if (!existing?.evidence_path) {
      const { data: media, error: downloadError } = await serviceClient.storage
        .from('media-vault')
        .download(report.media_path);
      if (downloadError || !media) {
        await serviceClient
          .from('content_reports')
          .update({ status: 'evidence_failed' })
          .eq('id', report.report_id);
        await notifySentry('moderation.evidence.failed', { report_id: report.report_id }, 'error');
        return json({ error: 'Evidence could not be secured. Try again before closing the message.' }, 500);
      }

      const extension = extensionFor(report.media_path, report.media_type ?? 'image');
      const evidencePath = `${report.report_id}/evidence.${extension}`;
      const { error: uploadError } = await serviceClient.storage
        .from('moderation-evidence')
        .upload(evidencePath, media, {
          contentType: media.type || (report.media_type === 'video' ? 'video/mp4' : 'image/jpeg'),
          upsert: true,
        });
      if (uploadError) {
        await serviceClient
          .from('content_reports')
          .update({ status: 'evidence_failed' })
          .eq('id', report.report_id);
        await notifySentry('moderation.evidence.failed', { report_id: report.report_id }, 'error');
        return json({ error: 'Evidence could not be secured. Try again before closing the message.' }, 500);
      }

      const { error: updateError } = await serviceClient
        .from('content_reports')
        .update({ evidence_path: evidencePath, status: 'open' })
        .eq('id', report.report_id);
      if (updateError) return json({ error: 'Evidence state could not be saved' }, 500);
    }
  }

  await notifySentry(
    'moderation.report.created',
    {
      report_id: report.report_id,
      reason: payload.reason,
      priority: payload.reason === 'violence' || payload.reason === 'self_harm' || payload.reason === 'illegal_content' ? 'critical' : 'normal',
    },
    payload.reason === 'violence' || payload.reason === 'self_harm' || payload.reason === 'illegal_content' ? 'warning' : 'info'
  );
  return json({ ok: true, reportId: report.report_id });
});
