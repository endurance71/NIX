import { processVideo, type Provider } from "./video.ts";
import type { BudgetLedger } from "./budget.ts";
import {
  CLAIM_LIMIT,
  LEASE_SECONDS,
  PROCESS_TIMEOUT_MS,
  WAITING_BUDGET,
} from "./constants.ts";
import type { FakeProvider } from "./fake-provider.ts";
import {
  processIntegrationJob,
  type ContentKind,
  type IntegrationJob,
  type ProcessOutcome,
} from "./process.ts";
import type { ShutdownController } from "./shutdown.ts";

export type Job = { id: string; path: string };
export type Outcome = {
  decision: "approved" | "rejected" | "error";
  maxSeverity: number | null;
  error?: string;
  waitingReason?: typeof WAITING_BUDGET;
};
export interface Queue {
  claim(owner: string, limit: 1, leaseSeconds: 900): Promise<Job[]>;
  complete(job: Job, owner: string, outcome: Outcome): Promise<void>;
  materialize(job: Job): Promise<void>;
}

export type IntegrationQueueJob = IntegrationJob & {
  /** Row fields needed for materialize routing. */
  contentKind: "text" | "media";
};

export interface IntegrationQueue {
  claim(
    owner: string,
    limit: typeof CLAIM_LIMIT,
    leaseSeconds: typeof LEASE_SECONDS,
  ): Promise<IntegrationQueueJob[]>;
  complete(
    job: IntegrationQueueJob,
    owner: string,
    outcome: Outcome,
  ): Promise<void>;
  /** Defer job without approving when budget is exhausted. */
  deferForBudget(
    job: IntegrationQueueJob,
    owner: string,
    reason: typeof WAITING_BUDGET,
  ): Promise<void>;
  materialize(job: IntegrationQueueJob): Promise<void>;
  /** Recover approved jobs that never materialized. */
  recoverApprovedUnmaterialized(
    owner: string,
  ): Promise<IntegrationQueueJob[]>;
  markMaterialized(job: IntegrationQueueJob): Promise<void>;
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

/**
 * C3B integration worker: text/image/video, durable budget, recovery, shutdown.
 * Fake provider only in offline tests — azureRequestCount must stay local.
 */
export function createIntegrationWorker(
  queue: IntegrationQueue,
  provider: FakeProvider,
  ledger: BudgetLedger,
  options: {
    timeoutMs?: number;
    shutdown?: ShutdownController;
    owner?: string;
  } = {},
) {
  let busy = false;
  const owner = options.owner ?? `moderation-worker:${crypto.randomUUID()}`;
  const timeoutMs = options.timeoutMs ?? PROCESS_TIMEOUT_MS;
  const shutdown = options.shutdown;

  async function recoverTick(): Promise<number> {
    const pending = await queue.recoverApprovedUnmaterialized(owner);
    let recovered = 0;
    for (const job of pending) {
      await queue.materialize(job);
      await queue.markMaterialized(job);
      recovered++;
    }
    return recovered;
  }

  async function tick(): Promise<ProcessOutcome | null> {
    if (busy) throw new Error("worker_busy");
    if (shutdown?.isStopping()) return null;
    busy = true;
    try {
      await recoverTick();
      if (shutdown?.isStopping()) return null;

      const jobs = await queue.claim(owner, CLAIM_LIMIT, LEASE_SECONDS);
      if (jobs.length > CLAIM_LIMIT) throw new Error("claim_limit_violation");
      if (!jobs.length) return null;
      const job = jobs[0];

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let outcome: ProcessOutcome;
      try {
        outcome = await processIntegrationJob(
          job,
          provider,
          ledger,
          controller.signal,
        );
      } finally {
        clearTimeout(timer);
      }

      if (outcome.waitingReason === WAITING_BUDGET) {
        await queue.deferForBudget(job, owner, WAITING_BUDGET);
        return outcome;
      }

      const completeOutcome: Outcome = {
        decision: outcome.decision,
        maxSeverity: outcome.maxSeverity,
        error: outcome.error,
      };
      await queue.complete(job, owner, completeOutcome);
      if (outcome.decision === "approved") {
        await queue.materialize(job);
        await queue.markMaterialized(job);
      }
      return outcome;
    } finally {
      busy = false;
    }
  }

  return { tick, recoverTick, owner };
}

export type { ContentKind, IntegrationJob, ProcessOutcome };
