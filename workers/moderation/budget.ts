import { F0_HARD_BUDGET, WAITING_BUDGET } from "./constants.ts";

export type BudgetCategory = "text" | "image";

export type ReserveResult =
  | { ok: true; reservationId: string; idempotent?: boolean }
  | {
    ok: false;
    reason: typeof WAITING_BUDGET | "attempt_already_terminal";
  };

export type BudgetLedger = {
  /** Atomically reserve units before a provider attempt. */
  reserve(
    category: BudgetCategory,
    units: number,
    jobId: string,
    attemptId: string,
  ): Promise<ReserveResult>;
  /** Confirm that a reserved attempt was sent (consumed). */
  confirm(reservationId: string): Promise<void>;
  /**
   * Release only when the caller proves no request was sent
   * (e.g. aborted before fetch). Uncertain outcomes must NOT call this.
   */
  releaseIfUnused(reservationId: string): Promise<void>;
  snapshot(): Promise<{
    monthKey: string;
    textTxn: number;
    imageTxn: number;
    reservedTxn: number;
    consumedTxn: number;
    externalUsed: number;
    hardBudget: number;
  }>;
};

function monthKeyUtc(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

type OpenRow = {
  reservationId: string;
  attemptId: string;
  category: BudgetCategory;
  units: number;
  confirmed: boolean;
  released: boolean;
};

/**
 * In-memory ledger mirroring SQL semantics:
 * - open attempt_id → idempotent reserve
 * - confirmed/released attempt_id → no free retry
 * - new attempt_id required for each real send
 */
export function createMemoryBudgetLedger(
  options: {
    hardBudget?: number;
    externalUsed?: number;
    monthKey?: string;
  } = {},
): BudgetLedger {
  const hardBudget = options.hardBudget ?? F0_HARD_BUDGET;
  const month = options.monthKey ?? monthKeyUtc();
  let textTxn = 0;
  let imageTxn = 0;
  let reservedTxn = 0;
  let consumedTxn = 0;
  const externalUsed = options.externalUsed ?? 0;
  const byReservation = new Map<string, OpenRow>();
  const byAttempt = new Map<string, OpenRow>();

  function usedTotal(): number {
    return externalUsed + consumedTxn + reservedTxn;
  }

  return {
    async reserve(category, units, _jobId, attemptId) {
      if (!Number.isInteger(units) || units < 1) {
        throw new Error("invalid_budget_units");
      }
      if (!attemptId || attemptId.trim().length === 0) {
        throw new Error("attempt_id_required");
      }

      const existing = byAttempt.get(attemptId);
      if (existing) {
        if (existing.confirmed || existing.released) {
          return { ok: false, reason: "attempt_already_terminal" };
        }
        return {
          ok: true,
          reservationId: existing.reservationId,
          idempotent: true,
        };
      }

      if (usedTotal() + units > hardBudget) {
        return { ok: false, reason: WAITING_BUDGET };
      }

      const reservationId = crypto.randomUUID();
      const row: OpenRow = {
        reservationId,
        attemptId,
        category,
        units,
        confirmed: false,
        released: false,
      };
      reservedTxn += units;
      if (category === "text") textTxn += units;
      else imageTxn += units;
      byReservation.set(reservationId, row);
      byAttempt.set(attemptId, row);
      return { ok: true, reservationId };
    },
    async confirm(reservationId) {
      const row = byReservation.get(reservationId);
      if (!row || row.confirmed || row.released) return;
      row.confirmed = true;
      reservedTxn -= row.units;
      consumedTxn += row.units;
    },
    async releaseIfUnused(reservationId) {
      const row = byReservation.get(reservationId);
      if (!row || row.confirmed || row.released) return;
      row.released = true;
      reservedTxn -= row.units;
      if (row.category === "text") textTxn -= row.units;
      else imageTxn -= row.units;
    },
    async snapshot() {
      return {
        monthKey: month,
        textTxn,
        imageTxn,
        reservedTxn,
        consumedTxn,
        externalUsed,
        hardBudget,
      };
    },
  };
}

/** Parallel reserve stress helper for tests. */
export async function parallelReserve(
  ledger: BudgetLedger,
  category: BudgetCategory,
  units: number,
  count: number,
): Promise<{ ok: number; exhausted: number }> {
  const results = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      ledger.reserve(category, units, `job-${i}`, crypto.randomUUID())
    ),
  );
  let ok = 0;
  let exhausted = 0;
  for (const r of results) {
    if (r.ok) ok++;
    else exhausted++;
  }
  return { ok, exhausted };
}
