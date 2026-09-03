import type { BudgetLedger, ReserveResult } from "./budget.ts";
import { F0_HARD_BUDGET, WAITING_BUDGET } from "./constants.ts";
import type { Rpc } from "./rpc-queue.ts";

/** Durable budget ledger via service_role RPCs (local Supabase / future staging). */
export function sqlBudgetLedger(
  rpc: Rpc,
  options: { hardBudget?: number; externalUsed?: number } = {},
): BudgetLedger {
  const hardBudget = options.hardBudget ?? F0_HARD_BUDGET;
  const externalUsed = options.externalUsed ?? 0;

  return {
    async reserve(category, units, jobId, attemptId) {
      const { data, error } = await rpc("reserve_moderation_budget", {
        p_category: category,
        p_units: units,
        p_job_id: jobId,
        p_attempt_id: attemptId,
        p_hard_budget: hardBudget,
        p_external_used: externalUsed,
      });
      if (error) throw new Error("budget_reserve_failed");
      const row = data as Record<string, unknown> | null;
      if (!row || row.ok !== true) {
        return { ok: false, reason: WAITING_BUDGET } satisfies ReserveResult;
      }
      return {
        ok: true,
        reservationId: String(row.reservation_id),
      };
    },
    async confirm(reservationId) {
      const { error } = await rpc("confirm_moderation_budget", {
        p_reservation_id: reservationId,
      });
      if (error) throw new Error("budget_confirm_failed");
    },
    async releaseIfUnused(reservationId) {
      const { error } = await rpc("release_moderation_budget_if_unused", {
        p_reservation_id: reservationId,
      });
      if (error) throw new Error("budget_release_failed");
    },
    async snapshot() {
      // Counters live in private.moderation_f0_ledger; offline tests use memory.
      return {
        monthKey: "rpc",
        textTxn: -1,
        imageTxn: -1,
        reservedTxn: -1,
        consumedTxn: -1,
        externalUsed,
        hardBudget,
      };
    },
  };
}
