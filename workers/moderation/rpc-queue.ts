import { POLICY_VERSION } from "../../supabase/functions/_shared/moderation-policy.ts";
import {
  type IntegrationQueue,
  type IntegrationQueueJob,
  type Job,
  type Outcome,
  type Queue,
} from "./core.ts";
import { WAITING_BUDGET } from "./constants.ts";
import type { ContentKind } from "./process.ts";
import { terminalInputError } from './download.ts';

async function finishInputFailure(rpc: Rpc, id: string, owner: string, error: unknown) {
  const terminal = terminalInputError(error);
  const { error: completionError } = await rpc('complete_moderation_job', {
    p_job_id: id, p_lease_owner: owner, p_status: terminal ? 'error' : 'pending',
    p_decision: 'error', p_policy_version: POLICY_VERSION,
    p_last_error: terminal && error instanceof Error ? error.message : 'input_resolution_retry',
    p_retry_delay_seconds: terminal ? null : 30,
  });
  if (completionError) throw new Error('input_failure_completion_failed_or_lease_lost');
}

/** Injection-only adapter. No credentials, networking client or live entry point in C3A. */
export type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

export function rpcQueue(
  rpc: Rpc,
  resolveInput: (row: Record<string, unknown>) => Promise<string>,
): Queue {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    async claim(owner, limit, leaseSeconds) {
      const { data, error } = await rpc("claim_moderation_jobs", {
        p_limit: limit,
        p_lease_owner: owner,
        p_lease_seconds: leaseSeconds,
      });
      if (error || !Array.isArray(data) || data.length > 1) {
        throw new Error("claim_failed");
      }
      const jobs: Job[] = [];
      for (const row of data) {
        if (typeof row?.id !== "string") throw new Error("claim_invalid");
        rows.set(row.id, row);
        try { jobs.push({ id: row.id, path: await resolveInput(row) }); }
        catch (error) {
          rows.delete(row.id);
          await finishInputFailure(rpc, row.id, owner, error);
        }
      }
      return jobs;
    },
    async complete(job: Job, owner: string, outcome: Outcome) {
      const { error } = await rpc("complete_moderation_job", {
        p_job_id: job.id,
        p_lease_owner: owner,
        p_status: outcome.decision,
        p_decision: outcome.decision,
        p_policy_version: POLICY_VERSION,
        p_max_severity: outcome.maxSeverity,
        p_last_error: outcome.error ?? null,
      });
      if (error) {
        rows.delete(job.id);
        throw new Error("completion_failed_or_lease_lost");
      }
      if (outcome.decision !== "approved") rows.delete(job.id);
    },
    async materialize(job) {
      const row = rows.get(job.id);
      rows.delete(job.id);
      if (!row || !["text", "media"].includes(String(row.content_kind))) {
        throw new Error("invalid_content_kind");
      }
      const name = row.content_kind === "text"
        ? "materialize_approved_text_message"
        : "materialize_approved_media_batch";
      const { error } = await rpc(name, { p_job_id: job.id });
      if (error) throw new Error("materialization_failed");
    },
  };
}

function mapKind(row: Record<string, unknown>): ContentKind {
  if (row.content_kind === "text") return "text";
  if (row.media_type === "video" || row.kind === "video") return "video";
  return "image";
}

/**
 * C3B RPC adapter: claim/complete/materialize/budget defer/recovery.
 * resolveJob loads local paths or text without logging bodies.
 */
export function integrationRpcQueue(
  rpc: Rpc,
  resolveJob: (row: Record<string, unknown>) => Promise<{
    path?: string;
    text?: string;
    kind?: ContentKind;
  }>,
): IntegrationQueue {
  const rows = new Map<string, Record<string, unknown>>();

  async function toJob(
    row: Record<string, unknown>,
  ): Promise<IntegrationQueueJob> {
    if (typeof row.id !== "string") throw new Error("claim_invalid");
    const resolved = await resolveJob(row);
    const kind = resolved.kind ?? mapKind(row);
    const contentKind = row.content_kind === "text" ? "text" : "media";
    rows.set(row.id, row);
    return {
      id: row.id,
      kind,
      path: resolved.path,
      text: resolved.text,
      contentKind,
      attemptCount: typeof row.attempt_count === "number"
        ? row.attempt_count
        : undefined,
    };
  }

  return {
    async claim(owner, limit, leaseSeconds) {
      const { data, error } = await rpc("claim_moderation_jobs", {
        p_limit: limit,
        p_lease_owner: owner,
        p_lease_seconds: leaseSeconds,
      });
      if (error || !Array.isArray(data) || data.length > limit) {
        throw new Error("claim_failed");
      }
      const jobs: IntegrationQueueJob[] = [];
      for (const row of data) {
        if (typeof row?.id !== 'string') throw new Error('claim_invalid');
        try { jobs.push(await toJob(row as Record<string, unknown>)); }
        catch (error) { await finishInputFailure(rpc, row.id, owner, error); }
      }
      return jobs;
    },
    async complete(job, owner, outcome) {
      const { error } = await rpc("complete_moderation_job", {
        p_job_id: job.id,
        p_lease_owner: owner,
        p_status: outcome.decision,
        p_decision: outcome.decision,
        p_policy_version: POLICY_VERSION,
        p_max_severity: outcome.maxSeverity,
        p_last_error: outcome.error ?? null,
        p_waiting_reason: null,
      });
      if (error) {
        rows.delete(job.id);
        throw new Error("completion_failed_or_lease_lost");
      }
      if (outcome.decision !== "approved") rows.delete(job.id);
    },
    async retryLater(job, owner, lastError, delaySeconds) {
      const { error } = await rpc("complete_moderation_job", {
        p_job_id: job.id,
        p_lease_owner: owner,
        p_status: "pending",
        p_decision: "error",
        p_policy_version: POLICY_VERSION,
        p_last_error: lastError,
        p_retry_delay_seconds: delaySeconds,
      });
      rows.delete(job.id);
      if (error) throw new Error("retry_failed_or_lease_lost");
    },
    async deferForBudget(job, owner, reason) {
      const { error } = await rpc("complete_moderation_job", {
        p_job_id: job.id,
        p_lease_owner: owner,
        p_status: "pending",
        p_decision: "error",
        p_policy_version: POLICY_VERSION,
        p_last_error: reason,
        p_waiting_reason: reason === WAITING_BUDGET ? WAITING_BUDGET : reason,
        p_retry_delay_seconds: null,
        p_next_attempt_at_month_rollover: true,
      });
      rows.delete(job.id);
      if (error) throw new Error("defer_budget_failed_or_lease_lost");
    },
    async materialize(job) {
      const row = rows.get(job.id);
      if (!row) {
        // Recovery path may re-fetch; still call materialize by contentKind.
      }
      const contentKind = row
        ? String(row.content_kind)
        : job.contentKind;
      const name = contentKind === "text"
        ? "materialize_approved_text_message"
        : "materialize_approved_media_batch";
      const { error } = await rpc(name, { p_job_id: job.id });
      if (error) throw new Error("materialization_failed");
    },
    async recoverApprovedUnmaterialized(owner) {
      const { data, error } = await rpc(
        "claim_approved_unmaterialized_moderation_jobs",
        { p_lease_owner: owner, p_limit: 1 },
      );
      if (error || !Array.isArray(data)) {
        throw new Error("recovery_claim_failed");
      }
      const jobs: IntegrationQueueJob[] = [];
      for (const row of data) {
        if (typeof row?.id !== 'string') throw new Error('recovery_claim_invalid');
        // Approval is already durable. Materialization needs only the job ID;
        // downloading again could fail after payload retention or waste bytes.
        rows.set(row.id, row);
        jobs.push({ id: row.id, kind: mapKind(row),
          contentKind: row.content_kind === 'text' ? 'text' : 'media' });
      }
      return jobs;
    },
    async markMaterialized(job) {
      const { error } = await rpc("mark_moderation_job_materialized", {
        p_job_id: job.id,
      });
      rows.delete(job.id);
      if (error) throw new Error("mark_materialized_failed");
    },
  };
}
