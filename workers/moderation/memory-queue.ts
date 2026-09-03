import type {
  IntegrationQueue,
  IntegrationQueueJob,
  Outcome,
} from "./core.ts";
import { WAITING_BUDGET } from "./constants.ts";
import type { ContentKind } from "./process.ts";

export type MemoryJobSeed = {
  id: string;
  kind: ContentKind;
  path?: string;
  text?: string;
  status?: "pending" | "processing" | "approved" | "rejected" | "error";
  leaseOwner?: string | null;
  leaseExpiresAt?: number | null;
  materializedAt?: number | null;
  waitingReason?: string | null;
  nextAttemptAt?: number;
};

type Row = MemoryJobSeed & {
  status: "pending" | "processing" | "approved" | "rejected" | "error";
  leaseOwner: string | null;
  leaseExpiresAt: number | null;
  materializedAt: number | null;
  waitingReason: string | null;
  nextAttemptAt: number;
  contentKind: "text" | "media";
  materializeCount: number;
  messagesPublished: number;
};

/**
 * In-memory queue mirroring claim/complete/materialize/recovery contracts
 * for offline C3B tests without Postgres.
 */
export function createMemoryIntegrationQueue(
  seeds: MemoryJobSeed[],
): IntegrationQueue & {
  rows: () => Row[];
  published: () => number;
} {
  const now = () => Date.now();
  const rows = new Map<string, Row>();
  for (const seed of seeds) {
    rows.set(seed.id, {
      ...seed,
      status: seed.status ?? "pending",
      leaseOwner: seed.leaseOwner ?? null,
      leaseExpiresAt: seed.leaseExpiresAt ?? null,
      materializedAt: seed.materializedAt ?? null,
      waitingReason: seed.waitingReason ?? null,
      nextAttemptAt: seed.nextAttemptAt ?? 0,
      contentKind: seed.kind === "text" ? "text" : "media",
      materializeCount: 0,
      messagesPublished: 0,
    });
  }

  function toJob(row: Row): IntegrationQueueJob {
    return {
      id: row.id,
      kind: row.kind,
      path: row.path,
      text: row.text,
      contentKind: row.contentKind,
    };
  }

  return {
    rows: () => [...rows.values()],
    published: () =>
      [...rows.values()].reduce((n, r) => n + r.messagesPublished, 0),
    async claim(owner, limit, leaseSeconds) {
      const claimed: IntegrationQueueJob[] = [];
      const t = now();
      for (const row of rows.values()) {
        if (claimed.length >= limit) break;
        const pendingReady = row.status === "pending" &&
          row.nextAttemptAt <= t;
        const expired = row.status === "processing" &&
          row.leaseExpiresAt !== null &&
          row.leaseExpiresAt <= t;
        if (!pendingReady && !expired) continue;
        row.status = "processing";
        row.leaseOwner = owner;
        row.leaseExpiresAt = t + leaseSeconds * 1000;
        row.waitingReason = null;
        claimed.push(toJob(row));
      }
      return claimed;
    },
    async complete(job, owner, outcome: Outcome) {
      const row = rows.get(job.id);
      if (!row) throw new Error("completion_failed_or_lease_lost");
      if (row.leaseOwner !== owner) {
        throw new Error("completion_failed_or_lease_lost");
      }
      row.status = outcome.decision;
      row.leaseOwner = null;
      row.leaseExpiresAt = null;
      row.waitingReason = null;
    },
    async deferForBudget(job, owner, reason) {
      const row = rows.get(job.id);
      if (!row || row.leaseOwner !== owner) {
        throw new Error("defer_budget_failed_or_lease_lost");
      }
      row.status = "pending";
      row.waitingReason = reason === WAITING_BUDGET ? WAITING_BUDGET : reason;
      row.leaseOwner = null;
      row.leaseExpiresAt = null;
      // Far future — month rollover stand-in.
      row.nextAttemptAt = now() + 30 * 24 * 3600 * 1000;
    },
    async materialize(job) {
      const row = rows.get(job.id);
      if (!row || row.status !== "approved") {
        throw new Error("materialization_failed");
      }
      row.materializeCount += 1;
      // Idempotent publish: only first successful materialize creates a message.
      if (row.messagesPublished === 0) row.messagesPublished = 1;
    },
    async recoverApprovedUnmaterialized(_owner) {
      const out: IntegrationQueueJob[] = [];
      for (const row of rows.values()) {
        if (row.status === "approved" && row.materializedAt === null) {
          out.push(toJob(row));
        }
      }
      return out.slice(0, 1);
    },
    async markMaterialized(job) {
      const row = rows.get(job.id);
      if (!row || row.status !== "approved") {
        throw new Error("mark_materialized_failed");
      }
      row.materializedAt = row.materializedAt ?? now();
      row.leaseOwner = null;
      row.leaseExpiresAt = null;
    },
  };
}
