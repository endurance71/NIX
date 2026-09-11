import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';
import { json } from '../_shared/http.ts';
import { hasServiceRoleBearer } from '../_shared/service-auth.ts';
import {
  analyzeImageBase64,
  analyzeText,
  azureConfigured,
  bytesToBase64,
  combineFrameDecisions,
  decideAnalysis,
} from '../_shared/moderation-azure.ts';
import { extractVideoFrames } from '../_shared/moderation-video-frames.ts';
import { POLICY_VERSION } from '../_shared/moderation-policy.ts';

type ModerationJob = {
  id: string;
  content_kind: 'text' | 'media';
  batch_id: string | null;
  asset_id: string | null;
  text_payload_id: string | null;
  sender_id: string;
  receiver_id: string | null;
  status: string;
  attempt_count: number;
};

// Video frames require ffmpeg/ffprobe on the worker runtime. Hosted Supabase
// Edge does not ship ffmpeg — missing binaries fail closed (`error`), never
// approve from a thumbnail. Production video must run where ffmpeg is installed.
const LEASE_OWNER = `moderation-worker:${crypto.randomUUID()}`;
const RETRY_SECONDS = [30, 120, 600, 3600];

function retryDelay(attempt: number) {
  return RETRY_SECONDS[Math.min(Math.max(attempt - 1, 0), RETRY_SECONDS.length - 1)];
}

async function rejectMediaBatch(
  client: SupabaseClient,
  job: ModerationJob,
  reason: string,
) {
  if (!job.batch_id || !job.asset_id) return;
  const { data: asset } = await client
    .from('media_assets')
    .select('storage_path')
    .eq('id', job.asset_id)
    .maybeSingle();
  if (asset?.storage_path) {
    await client.storage.from('media-vault').remove([asset.storage_path]);
  }
  await client.from('media_assets').update({ status: 'deleting' }).eq('id', job.asset_id);
  await client.from('media_upload_batches').update({ status: 'failed', updated_at: new Date().toISOString() })
    .eq('id', job.batch_id);
  console.info('moderation_reject_media', { jobId: job.id, reason });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server is not configured' }, 500);
  if (!hasServiceRoleBearer(req, serviceRoleKey)) return json({ error: 'Unauthorized' }, 401);

  if (!azureConfigured()) {
    return json({ error: 'Moderation provider not configured', processed: 0 }, 503);
  }

  const client = createClient(supabaseUrl, serviceRoleKey);
  const { data: claimed, error: claimError } = await client.rpc('claim_moderation_jobs', {
    p_limit: 5,
    p_lease_owner: LEASE_OWNER,
    p_lease_seconds: 900,
  });
  if (claimError) return json({ error: 'Could not claim jobs' }, 500);

  const jobs = (claimed ?? []) as ModerationJob[];
  let processed = 0;

  for (const job of jobs) {
    try {
      if (job.content_kind === 'text') {
        const { data: payload, error: payloadError } = await client
          .from('moderation_text_payloads')
          .select('body')
          .eq('id', job.text_payload_id)
          .maybeSingle();
        if (payloadError || !payload?.body) {
          await client.rpc('complete_moderation_job', {
            p_job_id: job.id,
            p_lease_owner: LEASE_OWNER,
            p_status: 'error',
            p_decision: 'error',
            p_policy_version: POLICY_VERSION,
            p_last_error: 'payload_missing',
          });
          continue;
        }

        const result = await analyzeText(payload.body);
        if (!result.ok) {
          await client.rpc('complete_moderation_job', {
            p_job_id: job.id,
            p_lease_owner: LEASE_OWNER,
            p_status: result.retryable ? 'pending' : 'error',
            p_decision: 'error',
            p_policy_version: POLICY_VERSION,
            p_provider_operation_id: result.operationId,
            p_last_error: `provider_${result.status ?? 'unknown'}`,
            p_retry_delay_seconds: result.retryable ? retryDelay(job.attempt_count) : null,
          });
          continue;
        }

        const decision = decideAnalysis(result.analysis);
        await client.rpc('complete_moderation_job', {
          p_job_id: job.id,
          p_lease_owner: LEASE_OWNER,
          p_status: decision.decision === 'approved' ? 'approved' : decision.decision === 'rejected' ? 'rejected' : 'error',
          p_decision: decision.decision,
          p_policy_version: decision.policyVersion,
          p_max_severity: decision.maxSeverity,
          p_provider_operation_id: result.operationId,
          p_last_error: decision.decision === 'error' ? 'policy_error' : null,
          p_retry_delay_seconds: decision.decision === 'error' ? retryDelay(job.attempt_count) : null,
        });

        if (decision.decision === 'approved') {
          await client.rpc('materialize_approved_text_message', { p_job_id: job.id });
        } else if (decision.decision === 'rejected') {
          await client.from('moderation_text_payloads').delete().eq('id', job.text_payload_id);
        }
        processed += 1;
        continue;
      }

      const { data: asset, error: assetError } = await client
        .from('media_assets')
        .select('storage_path, content_type, media_type')
        .eq('id', job.asset_id)
        .maybeSingle();
      if (assetError || !asset?.storage_path) {
        await client.rpc('complete_moderation_job', {
          p_job_id: job.id,
          p_lease_owner: LEASE_OWNER,
          p_status: 'error',
          p_decision: 'error',
          p_last_error: 'asset_missing',
        });
        continue;
      }

      const { data: blob, error: downloadError } = await client.storage
        .from('media-vault')
        .download(asset.storage_path);
      if (downloadError || !blob) {
        await client.rpc('complete_moderation_job', {
          p_job_id: job.id,
          p_lease_owner: LEASE_OWNER,
          p_status: 'pending',
          p_decision: 'error',
          p_last_error: 'download_failed',
          p_retry_delay_seconds: retryDelay(job.attempt_count),
        });
        continue;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());

      let decision;
      let operationId: string | null = null;

      if (asset.media_type === 'video') {
        const frames = await extractVideoFrames(bytes, Deno.env.get('MODERATION_VIDEO_STRATEGY'));
        if (!frames.ok) {
          await client.rpc('complete_moderation_job', {
            p_job_id: job.id,
            p_lease_owner: LEASE_OWNER,
            p_status: 'error',
            p_decision: 'error',
            p_policy_version: POLICY_VERSION,
            p_last_error: frames.error,
          });
          continue;
        }

        const frameDecisions = [];
        let providerFailed = false;
        for (const frame of frames.frames) {
          const analyzeResult = await analyzeImageBase64(bytesToBase64(frame));
          if (!analyzeResult.ok) {
            await client.rpc('complete_moderation_job', {
              p_job_id: job.id,
              p_lease_owner: LEASE_OWNER,
              p_status: analyzeResult.retryable ? 'pending' : 'error',
              p_decision: 'error',
              p_policy_version: POLICY_VERSION,
              p_provider_operation_id: analyzeResult.operationId,
              p_last_error: `provider_${analyzeResult.status ?? 'unknown'}`,
              p_retry_delay_seconds: analyzeResult.retryable ? retryDelay(job.attempt_count) : null,
            });
            providerFailed = true;
            break;
          }
          operationId = analyzeResult.operationId;
          frameDecisions.push(decideAnalysis(analyzeResult.analysis));
        }
        if (providerFailed) continue;
        decision = combineFrameDecisions(frameDecisions);
      } else {
        const analyzeResult = await analyzeImageBase64(bytesToBase64(bytes));
        if (!analyzeResult.ok) {
          await client.rpc('complete_moderation_job', {
            p_job_id: job.id,
            p_lease_owner: LEASE_OWNER,
            p_status: analyzeResult.retryable ? 'pending' : 'error',
            p_decision: 'error',
            p_policy_version: POLICY_VERSION,
            p_provider_operation_id: analyzeResult.operationId,
            p_last_error: `provider_${analyzeResult.status ?? 'unknown'}`,
            p_retry_delay_seconds: analyzeResult.retryable ? retryDelay(job.attempt_count) : null,
          });
          continue;
        }
        operationId = analyzeResult.operationId;
        decision = decideAnalysis(analyzeResult.analysis);
      }
      const terminalStatus = decision.decision === 'approved'
        ? 'approved'
        : decision.decision === 'rejected'
          ? 'rejected'
          : 'error';

      await client.rpc('complete_moderation_job', {
        p_job_id: job.id,
        p_lease_owner: LEASE_OWNER,
        p_status: terminalStatus,
        p_decision: decision.decision,
        p_policy_version: decision.policyVersion,
        p_max_severity: decision.maxSeverity,
        p_provider_operation_id: operationId,
        p_last_error: decision.decision === 'error' ? 'policy_error' : null,
        p_retry_delay_seconds: decision.decision === 'error' ? retryDelay(job.attempt_count) : null,
      });

      if (decision.decision === 'approved') {
        await client.rpc('materialize_approved_media_batch', { p_job_id: job.id });
      } else if (decision.decision === 'rejected') {
        await rejectMediaBatch(client, job, 'provider_rejected');
      }
      processed += 1;
    } catch (error) {
      console.warn('moderation_worker_job_failed', {
        jobId: job.id,
        message: error instanceof Error ? error.message : 'unknown',
      });
      await client.rpc('complete_moderation_job', {
        p_job_id: job.id,
        p_lease_owner: LEASE_OWNER,
        p_status: 'pending',
        p_decision: 'error',
        p_last_error: 'worker_exception',
        p_retry_delay_seconds: retryDelay(job.attempt_count),
      });
    }
  }

  await client.rpc('cleanup_expired_moderation_quarantine');
  return json({ ok: true, processed, claimed: jobs.length });
});
