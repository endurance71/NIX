import { F0_HARD_BUDGET, WAITING_BUDGET } from "./constants.ts";

export type BudgetCategory = "text" | "image";

export type ReserveResult =
  | { ok: true; reservationId: string }
  | { ok: false; reason: typeof WAITING_BUDGET };

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

/**
 * In-memory ledger for offline tests. Mirrors durable DB semantics:
 * restart of this object loses state (tests use a fresh instance);
 * production uses SQL ledger that survives worker restart.
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
  const open = new Map<
    string,
    { category: BudgetCategory; units: number; confirmed: boolean }
  >();

  function usedTotal(): number {
    return externalUsed + consumedTxn + reservedTxn;
  }

  return {
    async reserve(category, units, _jobId, attemptId) {
      if (!Number.isInteger(units) || units < 1) {
        throw new Error("invalid_budget_units");
      }
      if (usedTotal() + units > hardBudget) {
        return { ok: false, reason: WAITING_BUDGET };
      }
      const reservationId = `${attemptId}:${crypto.randomUUID()}`;
      reservedTxn += units;
      if (category === "text") textTxn += units;
      else imageTxn += units;
      open.set(reservationId, { category, units, confirmed: false });
      return { ok: true, reservationId };
    },
    async confirm(reservationId) {
      const row = open.get(reservationId);
      if (!row || row.confirmed) return;
      row.confirmed = true;
      reservedTxn -= row.units;
      consumedTxn += row.units;
    },
    async releaseIfUnused(reservationId) {
      const row = open.get(reservationId);
      if (!row || row.confirmed) return;
      open.delete(reservationId);
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
      ledger.reserve(category, units, `job-${i}`, `attempt-${i}`)
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
