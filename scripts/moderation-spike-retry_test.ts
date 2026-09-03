/**
 * Cost-free retry/fail-closed contract for spike HTTP helper logic.
 * Uses the same requireBudget + retry classification rules as the live spike.
 */
import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requireBudgetBeforeRequest } from "./moderation-spike-lib.ts";

type FetchResult = { ok: true; body: unknown } | {
  ok: false;
  status: number;
  retryAfter?: string;
};

async function postAnalyzeMock(
  fetchImpl: (attempt: number) => Promise<FetchResult>,
  opts: { usedBefore: number; maxRetries: number },
): Promise<{ transactions: number; approved: boolean }> {
  let transactions = 0;
  for (let attempt = 1; attempt <= opts.maxRetries; attempt += 1) {
    requireBudgetBeforeRequest(opts.usedBefore, transactions);
    const response = await fetchImpl(attempt);
    transactions += 1;
    if (response.ok) {
      return { transactions, approved: true };
    }
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === opts.maxRetries) {
      return { transactions, approved: false };
    }
  }
  return { transactions, approved: false };
}

Deno.test("429 retries increment transaction counter and never approve on exhaustion", async () => {
  const result = await postAnalyzeMock(
    async () => ({ ok: false, status: 429, retryAfter: "1" }),
    { usedBefore: 0, maxRetries: 3 },
  );
  assertEquals(result.transactions, 3);
  assertEquals(result.approved, false);
});

Deno.test("5xx then success counts both attempts and can approve only after ok", async () => {
  const result = await postAnalyzeMock(
    async (
      attempt,
    ) => (attempt === 1 ? { ok: false, status: 503 } : { ok: true, body: {} }),
    { usedBefore: 10, maxRetries: 3 },
  );
  assertEquals(result.transactions, 2);
  assertEquals(result.approved, true);
});

Deno.test("hard budget blocks before a request that would exceed 4000", async () => {
  await assertRejects(async () => {
    await postAnalyzeMock(
      async () => ({ ok: true, body: {} }),
      { usedBefore: 4000, maxRetries: 1 },
    );
  });
});

Deno.test("requireBudgetBeforeRequest throws synchronously when already at ceiling", () => {
  assertThrows(() => requireBudgetBeforeRequest(4000, 0));
});
