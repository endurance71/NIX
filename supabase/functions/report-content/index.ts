import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';
import { corsHeaders, getBearerToken, json, notifySentry } from '../_shared/http.ts';
import { statusForRpcError, validateReportPayload } from './contract.ts';

function extensionFor(mediaPath: string, mediaType: string) {
  const raw = mediaPath.split('?')[0].split('.').pop()?.toLowerCase();
  if (raw && /^[a-z0-9]{2,5}$/.test(raw)) return raw;
  return mediaType === 'video' ? 'mp4' : 'jpg';
}

type ReportRow = {
  report_id?: string;
  media_path?: string | null;
  media_type?: string | null;
  text_message_id?: string | null;
};

async function markEvidenceFailed(
  serviceClient: ReturnType<typeof createClient>,
  reportId: string
) {
  await serviceClient.from('content_reports').update({ status: 'evidence_failed' }).eq('id', reportId);
  await notifySentry('moderation.evidence.failed', { report_id: reportId }, 'error');
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

  let payload: {
    reason?: string;
    nixId?: string;
    textMessageId?: string;
    reportedUserId?: string;
    details?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON payload' }, 400);
  }

  const validated = validateReportPayload(payload);
  if (!validated.ok) return json({ error: validated.error }, validated.status);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401);

  const { data, error } = await authClient.rpc('create_content_report_v2', {
    p_reason: validated.value.reason,
    p_nix_id: validated.value.nixId,
    p_text_message_id: validated.value.textMessageId,
    p_reported_user_id: validated.value.reportedUserId,
    p_details: validated.value.details,
  });
  if (error) {
    return json({ error: error.message }, statusForRpcError(error.message));
  }

  const report = (Array.isArray(data) ? data[0] : data) as ReportRow | null;
  if (!report?.report_id) return json({ error: 'Report was not created' }, 500);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  if (report.text_message_id) {
    const { data: existing } = await serviceClient
      .from('content_reports')
      .select('evidence_path')
      .eq('id', report.report_id)
      .maybeSingle();

    if (!existing?.evidence_path) {
      const { data: textMsg } = await serviceClient
        .from('text_messages')
        .select('id, sender_id, receiver_id, body, created_at')
        .eq('id', report.text_message_id)
        .maybeSingle();

      if (!textMsg) {
        await markEvidenceFailed(serviceClient, report.report_id);
        return json({ error: 'Evidence could not be secured. Try again before closing the message.' }, 500);
      }

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

      if (uploadError) {
        await markEvidenceFailed(serviceClient, report.report_id);
        return json({ error: 'Evidence could not be secured. Try again before closing the message.' }, 500);
      }

      const { error: updateError } = await serviceClient
        .from('content_reports')
        .update({ evidence_path: evidencePath, status: 'open' })
        .eq('id', report.report_id);
      if (updateError) return json({ error: 'Evidence state could not be saved' }, 500);
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
        await markEvidenceFailed(serviceClient, report.report_id);
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
        await markEvidenceFailed(serviceClient, report.report_id);
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
      reason: validated.value.reason,
      priority:
        validated.value.reason === 'violence' ||
        validated.value.reason === 'self_harm' ||
        validated.value.reason === 'illegal_content'
          ? 'critical'
          : 'normal',
    },
    validated.value.reason === 'violence' ||
      validated.value.reason === 'self_harm' ||
      validated.value.reason === 'illegal_content'
      ? 'warning'
      : 'info'
  );
  return json({ ok: true, reportId: report.report_id });
});
