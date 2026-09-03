import { createWorker, type Outcome, type Queue } from "./core.ts";
import { rpcQueue } from "./rpc-queue.ts";
import { command, COVERAGE, processVideo } from "./video.ts";
function assert(value: unknown): asserts value {
  if (!value) throw new Error("assertion_failed");
}
const safe = async () => ({
  categoriesAnalysis: [{ category: "Violence" as const, severity: 0 }],
});
const fakeProcess: typeof processVideo = async () => ({
  decision: "approved",
  maxSeverity: 0,
  policyVersion: "2026.08.27-p0",
  frames: 1,
  peakFrameBytes: 1,
  duration: 15,
  coverage: COVERAGE,
});
function harness(completeFails = false) {
  let materialized = 0;
  const outcomes: Outcome[] = [];
  const queue: Queue = {
    claim: async (_owner, limit, lease) => {
      assert(limit === 1 && lease === 900);
      return [{ id: "synthetic", path: "unused" }];
    },
    complete: async (_job, _owner, outcome) => {
      outcomes.push(outcome);
      if (completeFails) throw new Error("lost_lease");
    },
    materialize: async () => {
      materialized++;
    },
  };
  return { queue, outcomes, count: () => materialized };
}
for (const decision of ["approved", "rejected", "error"] as const) {
  Deno.test(`only approved completion materializes: ${decision}`, async () => {
    const h = harness();
    const worker = createWorker(h.queue, safe, 1000, async (...args) => {
      if (decision === "error") throw new Error("provider_failure");
      return {
        ...await fakeProcess(...args),
        decision,
        maxSeverity: decision === "rejected" ? 6 : 0,
      };
    });
    assert((await worker())?.decision === decision);
    assert(h.count() === (decision === "approved" ? 1 : 0));
  });
}
Deno.test("lost lease completion never materializes", async () => {
  const h = harness(true);
  let failed = false;
  try {
    await createWorker(h.queue, safe, 1000, fakeProcess)();
  } catch {
    failed = true;
  }
  assert(failed && h.count() === 0);
});
Deno.test("timeout fails closed", async () => {
  const h = harness();
  const worker = createWorker(
    h.queue,
    safe,
    10,
    async (_path, _provider, signal) => {
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true })
      );
      signal.throwIfAborted();
      throw new Error("unreachable");
    },
  );
  assert((await worker())?.error === "job_timeout" && h.count() === 0);
});
Deno.test("concurrent tick cannot claim a second job", async () => {
  const h = harness();
  const worker = createWorker(h.queue, safe, 1000, async (...args) => {
    await new Promise((r) => setTimeout(r, 20));
    return fakeProcess(...args);
  });
  const first = worker();
  let refused = false;
  try {
    await worker();
  } catch {
    refused = true;
  }
  await first;
  assert(refused && h.count() === 1);
});
Deno.test("RPC completion error blocks materialization with original argument names", async () => {
  const calls: string[] = [];
  const queue = rpcQueue(async (name, args) => {
    calls.push(name);
    if (name === "claim_moderation_jobs") {
      assert(args.p_limit === 1 && args.p_lease_seconds === 900);
      return {
        data: [{ id: "synthetic", content_kind: "media" }],
        error: null,
      };
    }
    assert(args.p_status === "approved" && args.p_job_id === "synthetic");
    return { data: null, error: "lost_lease" };
  }, async () => "unused");
  try {
    await createWorker(queue, safe, 1000, fakeProcess)();
  } catch { /* expected */ }
  assert(calls.join() === "claim_moderation_jobs,complete_moderation_job");
});
Deno.test("subprocess cancellation kills and reaps", async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 100);
  let failed = false;
  try {
    await command("ffmpeg", [
      "-v",
      "error",
      "-re",
      "-f",
      "lavfi",
      "-i",
      "color=d=60",
      "-f",
      "null",
      "-",
    ], controller.signal);
  } catch {
    failed = true;
  } finally {
    clearTimeout(timer);
  }
  assert(failed);
});
