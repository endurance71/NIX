import { POLICY_VERSION } from "../../supabase/functions/_shared/moderation-policy.ts";
import { type Job, type Outcome, type Queue } from "./core.ts";

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
        // Staging/download failures deliberately leave the lease unapproved.
        jobs.push({ id: row.id, path: await resolveInput(row) });
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
