import { processVideo, type Provider } from "./video.ts";
export type Job = { id: string; path: string };
export type Outcome = {
  decision: "approved" | "rejected" | "error";
  maxSeverity: number | null;
  error?: string;
};
export interface Queue {
  claim(owner: string, limit: 1, leaseSeconds: 900): Promise<Job[]>;
  complete(job: Job, owner: string, outcome: Outcome): Promise<void>;
  materialize(job: Job): Promise<void>;
}

/** Single-flight even if a caller invokes tick concurrently. No automatic retries. */
export function createWorker(
  queue: Queue,
  provider: Provider,
  timeoutMs = 600_000,
  process = processVideo,
) {
  let busy = false;
  const owner = `moderation-worker:${crypto.randomUUID()}`;
  return async function tick(): Promise<Outcome | null> {
    if (busy) throw new Error("worker_busy");
    busy = true;
    try {
      const jobs = await queue.claim(owner, 1, 900);
      if (jobs.length > 1) throw new Error("claim_limit_violation");
      if (!jobs.length) return null;
      const job = jobs[0];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let outcome: Outcome;
      try {
        const result = await process(job.path, provider, controller.signal);
        controller.signal.throwIfAborted();
        outcome = {
          decision: result.decision === "approved" ? "approved" : "rejected",
          maxSeverity: result.maxSeverity,
        };
      } catch {
        // No media paths, provider bodies or arbitrary exception text in evidence.
        outcome = {
          decision: "error",
          maxSeverity: null,
          error: controller.signal.aborted
            ? "job_timeout"
            : "processing_failed",
        };
      } finally {
        clearTimeout(timer);
      }
      // Failure/lost lease must propagate; never materialize before successful completion.
      await queue.complete(job, owner, outcome);
      if (outcome.decision === "approved") await queue.materialize(job);
      return outcome;
    } finally {
      busy = false;
    }
  };
}
