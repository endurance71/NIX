import { sqlBudgetLedger } from "./sql-budget.ts";

function assert(value: unknown, message = "assertion_failed"): asserts value {
  if (!value) throw new Error(message);
}

function recordingRpc() {
  const calls: Record<string, unknown>[] = [];
  const rpc = (_name: string, args: Record<string, unknown>) => {
    calls.push(args);
    return Promise.resolve({
      data: { ok: true, reservation_id: "r-1" },
      error: null,
    });
  };
  return { rpc, calls };
}

Deno.test("sql ledger sends external usage only in its measured month", async () => {
  const { rpc, calls } = recordingRpc();
  let now = new Date("2026-09-30T23:59:00Z");
  const ledger = sqlBudgetLedger(rpc, {
    externalUsed: 3630,
    externalUsedMonth: "2026-09",
    now: () => now,
  });

  await ledger.reserve("text", 1, "job-1", "attempt-1");
  assert(calls[0].p_external_used === 3630, "same month keeps external usage");

  now = new Date("2026-10-01T00:00:01Z");
  await ledger.reserve("text", 1, "job-2", "attempt-2");
  assert(calls[1].p_external_used === null, "next month must not inherit usage");
});

Deno.test("sql ledger without a measured month never sends external usage", async () => {
  const { rpc, calls } = recordingRpc();
  const ledger = sqlBudgetLedger(rpc, { externalUsed: 3630 });
  await ledger.reserve("image", 1, "job-1", "attempt-1");
  assert(calls[0].p_external_used === null);
});
