import { createMemoryBudgetLedger } from "./budget.ts";
import type { BudgetLedger } from "./budget.ts";
import { processIntegrationJob } from "./process.ts";
import type { ModerationProvider } from "./provider.ts";

function assert(value: unknown, message = "assertion_failed"): asserts value {
  if (!value) throw new Error(message);
}

// The SQL ledger confirms over the network; a provider that fails faster than
// that confirmation must not leave its rejection unhandled (Deno exits on it).
function slowConfirmLedger(): BudgetLedger {
  const ledger = createMemoryBudgetLedger({ hardBudget: 10 });
  return {
    ...ledger,
    async confirm(reservationId) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await ledger.confirm(reservationId);
    },
  };
}

function failingProvider(): ModerationProvider {
  const fail = () => Promise.reject(new Error("provider_network"));
  return {
    analyzeText: fail,
    analyzeImage: fail,
    asFrameProvider: () => fail,
    azureRequestCount: () => 1,
    reset: () => {},
  };
}

Deno.test("provider failure during budget confirmation is a handled transient error", async () => {
  const outcome = await processIntegrationJob(
    { id: "job-1", kind: "text", text: "hello" },
    failingProvider(),
    slowConfirmLedger(),
    new AbortController().signal,
  );
  assert(outcome.decision === "error", "job must not be approved");
  assert(outcome.error === "provider_network", `unexpected_error_${outcome.error}`);
});
