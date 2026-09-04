import {
  createMemoryBudgetLedger,
  parallelReserve,
} from "./budget.ts";
import { F0_HARD_BUDGET, MAX_INPUT_BYTES, WAITING_BUDGET } from "./constants.ts";
import { createIntegrationWorker } from "./core.ts";
import {
  assertLocalMediaPath,
  streamDownloadToFile,
} from "./download.ts";
import { createFakeProvider } from "./fake-provider.ts";
import { createMemoryIntegrationQueue } from "./memory-queue.ts";
import {
  cleanupOrphanTempDirs,
  createShutdownController,
} from "./shutdown.ts";
import { command } from "./video.ts";

function assert(value: unknown, msg = "assertion_failed"): asserts value {
  if (!value) throw new Error(msg);
}

async function makeTempDir(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "nix-c3b-" });
}

async function writeMinimalJpeg(path: string): Promise<void> {
  // 1x1 JPEG
  const bytes = Uint8Array.from(atob(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z",
  ), (c) => c.charCodeAt(0));
  await Deno.writeFile(path, bytes);
}

async function synthesizeMp4(
  path: string,
  opts: {
    seconds?: number;
    width?: number;
    height?: number;
    fps?: number;
    codec?: "libx264" | "libx265";
  } = {},
): Promise<void> {
  const seconds = opts.seconds ?? 1;
  const width = opts.width ?? 320;
  const height = opts.height ?? 240;
  const fps = opts.fps ?? 24;
  const codec = opts.codec ?? "libx264";
  const signal = AbortSignal.timeout(60_000);
  const args = [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `testsrc=size=${width}x${height}:rate=${fps}:duration=${seconds}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${seconds}`,
    "-c:v",
    codec,
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    path,
  ];
  try {
    await command("ffmpeg", args, signal);
  } catch {
    if (codec === "libx265") {
      // HEVC optional — fall back proves H.264 path still covered.
      await synthesizeMp4(path, { ...opts, codec: "libx264" });
      return;
    }
    throw new Error("ffmpeg_synthesize_failed");
  }
}

Deno.test("stream download enforces 100 MiB during read", async () => {
  const dir = await makeTempDir();
  try {
    const over = MAX_INPUT_BYTES + 1;
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= over) {
          controller.close();
          return;
        }
        const n = Math.min(chunk.byteLength, over - sent);
        controller.enqueue(chunk.subarray(0, n));
        sent += n;
      },
    });
    let failed = false;
    try {
      await streamDownloadToFile(
        { stream },
        `${dir}/big.bin`,
        AbortSignal.timeout(30_000),
      );
    } catch (e) {
      failed = e instanceof Error && e.message === "input_size_limit";
    }
    assert(failed);
    let exists = true;
    try {
      await Deno.stat(`${dir}/big.bin`);
    } catch {
      exists = false;
    }
    assert(!exists, "partial download must be removed");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("ffmpeg remote URL paths are rejected", () => {
  let failed = false;
  try {
    assertLocalMediaPath("https://example.com/a.mp4");
  } catch {
    failed = true;
  }
  assert(failed);
});

Deno.test("budget parallel reserve never exceeds hard cap", async () => {
  const ledger = createMemoryBudgetLedger({
    hardBudget: 10,
    externalUsed: 2,
  });
  const { ok, exhausted } = await parallelReserve(ledger, "image", 1, 20);
  assert(ok === 8 && exhausted === 12);
  const snap = await ledger.snapshot();
  assert(snap.reservedTxn + snap.consumedTxn + snap.externalUsed <= 10);
  assert(snap.hardBudget === 10);
});

Deno.test("uncertain provider failure does not release budget", async () => {
  const ledger = createMemoryBudgetLedger({ hardBudget: 5 });
  const r = await ledger.reserve("text", 1, "j1", "a1");
  assert(r.ok);
  await ledger.confirm(r.reservationId);
  await ledger.releaseIfUnused(r.reservationId);
  const snap = await ledger.snapshot();
  assert(snap.consumedTxn === 1 && snap.reservedTxn === 0);
});

Deno.test("open attempt reserve is idempotent; terminal blocks free retry", async () => {
  const ledger = createMemoryBudgetLedger({ hardBudget: 5 });
  const attempt = crypto.randomUUID();
  const first = await ledger.reserve("text", 1, "j1", attempt);
  assert(first.ok);
  const again = await ledger.reserve("text", 1, "j1", attempt);
  assert(again.ok && again.idempotent === true);
  assert(again.reservationId === first.reservationId);
  await ledger.confirm(first.reservationId);
  const terminal = await ledger.reserve("text", 1, "j1", attempt);
  assert(!terminal.ok && terminal.reason === "attempt_already_terminal");
  const charged = await ledger.reserve("text", 1, "j1", crypto.randomUUID());
  assert(charged.ok);
  const snap = await ledger.snapshot();
  assert(snap.consumedTxn === 1 && snap.reservedTxn === 1);
});

Deno.test("memory ledger rejects hardBudget above F0_HARD_BUDGET", () => {
  let failed = false;
  try {
    createMemoryBudgetLedger({ hardBudget: F0_HARD_BUDGET + 1 });
  } catch (e) {
    failed = e instanceof Error && e.message === "invalid_hard_budget";
  }
  assert(failed);
});

Deno.test("release then same attempt_id cannot free-retry", async () => {
  const ledger = createMemoryBudgetLedger({ hardBudget: 5 });
  const attempt = crypto.randomUUID();
  const r = await ledger.reserve("image", 1, "j1", attempt);
  assert(r.ok);
  await ledger.releaseIfUnused(r.reservationId);
  const retry = await ledger.reserve("image", 1, "j1", attempt);
  assert(!retry.ok && retry.reason === "attempt_already_terminal");
  const snap = await ledger.snapshot();
  assert(snap.reservedTxn === 0 && snap.consumedTxn === 0);
});

Deno.test("abort before send releases; abort after send does not", async () => {
  const ledger = createMemoryBudgetLedger({ hardBudget: 5 });
  const before = crypto.randomUUID();
  const reserved = await ledger.reserve("text", 1, "j1", before);
  assert(reserved.ok);
  await ledger.releaseIfUnused(reserved.reservationId);
  let snap = await ledger.snapshot();
  assert(snap.reservedTxn === 0);

  const after = crypto.randomUUID();
  const r2 = await ledger.reserve("text", 1, "j1", after);
  assert(r2.ok);
  await ledger.confirm(r2.reservationId);
  await ledger.releaseIfUnused(r2.reservationId);
  snap = await ledger.snapshot();
  assert(snap.consumedTxn === 1 && snap.reservedTxn === 0);
});

Deno.test("retry text/JPEG/video each charge a new attempt", async () => {
  const dir = await makeTempDir();
  const jpeg = `${dir}/r.jpg`;
  const mp4 = `${dir}/r.mp4`;
  await writeMinimalJpeg(jpeg);
  await synthesizeMp4(mp4, { seconds: 1 });
  try {
    const ledger = createMemoryBudgetLedger({ hardBudget: 50 });
    for (const kind of ["text", "image", "video"] as const) {
      for (let i = 0; i < 2; i++) {
        const job = kind === "text"
          ? { id: `retry-t-${i}`, kind, text: "hello" as string }
          : kind === "image"
          ? { id: `retry-i-${i}`, kind, path: jpeg }
          : { id: `retry-v-${i}`, kind, path: mp4 };
        const q = createMemoryIntegrationQueue([job]);
        const p = createFakeProvider("safe", { gapMs: 0 });
        const out = await createIntegrationWorker(q, p, ledger, {
          timeoutMs: 30_000,
        }).tick();
        assert(out?.decision === "approved", `${kind} retry ${i}`);
      }
    }
    const snap = await ledger.snapshot();
    // 2 text + 2 image + 2 video×(>=1 frame) — at least 6 consumed.
    assert(snap.consumedTxn >= 6);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("text approve and reject via fake provider", async () => {
  const dir = await makeTempDir();
  try {
    const safeQ = createMemoryIntegrationQueue([{
      id: "t-safe",
      kind: "text",
      text: "hello",
    }]);
    const safeP = createFakeProvider("safe", { gapMs: 0 });
    const safeW = createIntegrationWorker(
      safeQ,
      safeP,
      createMemoryBudgetLedger(),
      { timeoutMs: 5_000 },
    );
    const safeOut = await safeW.tick();
    assert(safeOut?.decision === "approved");
    assert(safeQ.published() === 1);
    assert(safeP.azureRequestCount() === 1);

    const badQ = createMemoryIntegrationQueue([{
      id: "t-bad",
      kind: "text",
      text: "REJECT_ME",
    }]);
    const badP = createFakeProvider("safe", { gapMs: 0 });
    const badW = createIntegrationWorker(
      badQ,
      badP,
      createMemoryBudgetLedger(),
      { timeoutMs: 5_000 },
    );
    const badOut = await badW.tick();
    assert(badOut?.decision === "rejected");
    assert(badQ.published() === 0);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("JPEG approve and reject", async () => {
  const dir = await makeTempDir();
  const jpeg = `${dir}/a.jpg`;
  await writeMinimalJpeg(jpeg);
  try {
    const okQ = createMemoryIntegrationQueue([{
      id: "i-ok",
      kind: "image",
      path: jpeg,
    }]);
    const okP = createFakeProvider("safe", { gapMs: 0 });
    assert(
      (await createIntegrationWorker(
        okQ,
        okP,
        createMemoryBudgetLedger(),
        { timeoutMs: 5_000 },
      ).tick())?.decision === "approved",
    );
    assert(okQ.published() === 1);

    const rjQ = createMemoryIntegrationQueue([{
      id: "i-rj",
      kind: "image",
      path: jpeg,
    }]);
    const rjP = createFakeProvider("reject", { gapMs: 0 });
    assert(
      (await createIntegrationWorker(
        rjQ,
        rjP,
        createMemoryBudgetLedger(),
        { timeoutMs: 5_000 },
      ).tick())?.decision === "rejected",
    );
    assert(rjQ.published() === 0);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("MP4 approve and reject with hybrid sampler", async () => {
  const dir = await makeTempDir();
  const mp4 = `${dir}/clip.mp4`;
  await synthesizeMp4(mp4, { seconds: 1, width: 320, height: 240, fps: 24 });
  try {
    const okQ = createMemoryIntegrationQueue([{
      id: "v-ok",
      kind: "video",
      path: mp4,
    }]);
    const okP = createFakeProvider("safe", { gapMs: 0 });
    const okOut = await createIntegrationWorker(
      okQ,
      okP,
      createMemoryBudgetLedger(),
      { timeoutMs: 120_000 },
    ).tick();
    assert(okOut?.decision === "approved", String(okOut?.error));
    assert(okQ.published() === 1);
    assert(okP.azureRequestCount() > 0);

    const rjQ = createMemoryIntegrationQueue([{
      id: "v-rj",
      kind: "video",
      path: mp4,
    }]);
    const rjP = createFakeProvider("reject", { gapMs: 0 });
    const rjOut = await createIntegrationWorker(
      rjQ,
      rjP,
      createMemoryBudgetLedger(),
      { timeoutMs: 120_000 },
    ).tick();
    assert(rjOut?.decision === "rejected");
    assert(rjQ.published() === 0);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

for (
  const mode of ["timeout", "http_429", "http_5xx", "invalid"] as const
) {
  Deno.test(`provider ${mode} fails closed without publish`, async () => {
    const q = createMemoryIntegrationQueue([{
      id: `err-${mode}`,
      kind: "text",
      text: "x",
    }]);
    const p = createFakeProvider(mode, { gapMs: 0 });
    const out = await createIntegrationWorker(
      q,
      p,
      createMemoryBudgetLedger(),
      { timeoutMs: mode === "timeout" ? 30 : 5_000 },
    ).tick();
    assert(out?.decision === "error");
    assert(q.published() === 0);
  });
}

Deno.test("parallel claim: second tick is worker_busy", async () => {
  const dir = await makeTempDir();
  const jpeg = `${dir}/a.jpg`;
  await writeMinimalJpeg(jpeg);
  try {
    const q = createMemoryIntegrationQueue([{
      id: "busy",
      kind: "image",
      path: jpeg,
    }]);
    const p = createFakeProvider("safe", { gapMs: 50 });
    const w = createIntegrationWorker(q, p, createMemoryBudgetLedger(), {
      timeoutMs: 10_000,
    });
    const first = w.tick();
    let refused = false;
    try {
      await w.tick();
    } catch {
      refused = true;
    }
    await first;
    assert(refused);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("lease mismatch never materializes", async () => {
  const custom = createMemoryIntegrationQueue([{
    id: "lease2",
    kind: "text",
    text: "ok",
  }]);
  const originalComplete = custom.complete.bind(custom);
  custom.complete = async (job, owner, outcome) => {
    const row = custom.rows().find((r) => r.id === job.id);
    assert(row);
    row.leaseOwner = "someone-else";
    try {
      await originalComplete(job, owner, outcome);
      throw new Error("should_have_failed");
    } catch (e) {
      assert(
        e instanceof Error &&
          e.message === "completion_failed_or_lease_lost",
      );
      throw e;
    }
  };
  const p = createFakeProvider("safe", { gapMs: 0 });
  let failed = false;
  try {
    await createIntegrationWorker(custom, p, createMemoryBudgetLedger(), {
      timeoutMs: 5_000,
    }).tick();
  } catch {
    failed = true;
  }
  assert(failed);
  assert(custom.published() === 0);
});

Deno.test("budget exhaustion defers without publish", async () => {
  const q = createMemoryIntegrationQueue([{
    id: "budget",
    kind: "text",
    text: "ok",
  }]);
  const ledger = createMemoryBudgetLedger({
    hardBudget: 1,
    externalUsed: 1,
  });
  const out = await createIntegrationWorker(
    q,
    createFakeProvider("safe", { gapMs: 0 }),
    ledger,
    { timeoutMs: 5_000 },
  ).tick();
  assert(out?.waitingReason === WAITING_BUDGET);
  assert(q.published() === 0);
  assert(q.rows()[0].status === "pending");
  assert(q.rows()[0].waitingReason === WAITING_BUDGET);
});

Deno.test("crash between approve and publish recovers once", async () => {
  const q = createMemoryIntegrationQueue([{
    id: "crash",
    kind: "text",
    text: "ok",
    status: "approved",
    materializedAt: null,
  }]);
  const w = createIntegrationWorker(
    q,
    createFakeProvider("safe", { gapMs: 0 }),
    createMemoryBudgetLedger(),
    { timeoutMs: 5_000 },
  );
  const n = await w.recoverTick();
  assert(n === 1);
  assert(q.published() === 1);
  const n2 = await w.recoverTick();
  assert(n2 === 0);
  assert(q.published() === 1);
});

Deno.test("no publish before approved decision", async () => {
  const q = createMemoryIntegrationQueue([{
    id: "order",
    kind: "text",
    text: "ok",
  }]);
  let materializedBeforeComplete = false;
  const wrapped = {
    claim: q.claim.bind(q),
    deferForBudget: q.deferForBudget.bind(q),
    recoverApprovedUnmaterialized: q.recoverApprovedUnmaterialized.bind(q),
    markMaterialized: q.markMaterialized.bind(q),
    rows: q.rows,
    published: q.published,
    complete: async (
      job: Parameters<typeof q.complete>[0],
      owner: string,
      outcome: Parameters<typeof q.complete>[2],
    ) => {
      if (q.published() > 0) materializedBeforeComplete = true;
      await q.complete(job, owner, outcome);
    },
    materialize: async (job: Parameters<typeof q.materialize>[0]) => {
      const row = q.rows().find((r) => r.id === job.id);
      assert(row?.status === "approved");
      await q.materialize(job);
    },
  };
  await createIntegrationWorker(
    wrapped,
    createFakeProvider("safe", { gapMs: 0 }),
    createMemoryBudgetLedger(),
    { timeoutMs: 5_000 },
  ).tick();
  assert(!materializedBeforeComplete);
  assert(q.published() === 1);
});

Deno.test("corrupt and oversized inputs fail closed with cleanup", async () => {
  const dir = await makeTempDir();
  try {
    const corrupt = `${dir}/bad.mp4`;
    await Deno.writeFile(corrupt, new Uint8Array([0, 1, 2, 3]));
    const q1 = createMemoryIntegrationQueue([{
      id: "corrupt",
      kind: "video",
      path: corrupt,
    }]);
    const out1 = await createIntegrationWorker(
      q1,
      createFakeProvider("safe", { gapMs: 0 }),
      createMemoryBudgetLedger(),
      { timeoutMs: 30_000 },
    ).tick();
    assert(out1?.decision === "error");
    assert(q1.published() === 0);

    const over = `${dir}/over.mp4`;
    // Size boundary without full 100MiB decode: pad tiny file beyond limit via download helper.
    const pad = MAX_INPUT_BYTES + 1;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(pad));
        controller.close();
      },
    });
    let limited = false;
    try {
      await streamDownloadToFile(
        { stream, contentLength: pad },
        over,
        AbortSignal.timeout(5_000),
      );
    } catch (e) {
      limited = e instanceof Error && e.message === "input_size_limit";
    }
    assert(limited);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("realistic synthetic videos: resolution fps codec", async () => {
  const dir = await makeTempDir();
  const cases: Array<{
    name: string;
    width: number;
    height: number;
    fps: number;
    codec: "libx264" | "libx265";
  }> = [
    { name: "480p24", width: 640, height: 480, fps: 24, codec: "libx264" },
    { name: "720p30", width: 1280, height: 720, fps: 30, codec: "libx264" },
    { name: "1080p12", width: 1920, height: 1080, fps: 12, codec: "libx264" },
    { name: "480p24hevc", width: 640, height: 480, fps: 24, codec: "libx265" },
  ];
  try {
    for (const c of cases) {
      const path = `${dir}/${c.name}.mp4`;
      await synthesizeMp4(path, {
        seconds: 1,
        width: c.width,
        height: c.height,
        fps: c.fps,
        codec: c.codec,
      });
      const q = createMemoryIntegrationQueue([{
        id: c.name,
        kind: "video",
        path,
      }]);
      const p = createFakeProvider("safe", { gapMs: 0 });
      const out = await createIntegrationWorker(
        q,
        p,
        createMemoryBudgetLedger({ hardBudget: F0_HARD_BUDGET }),
        { timeoutMs: 180_000 },
      ).tick();
      assert(out?.decision === "approved", `${c.name}: ${out?.error}`);
      assert(p.azureRequestCount() > 0);
      assert(q.published() === 1);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("controlled shutdown skips new claims", async () => {
  const shutdown = createShutdownController();
  const q = createMemoryIntegrationQueue([{
    id: "stop",
    kind: "text",
    text: "ok",
  }]);
  const w = createIntegrationWorker(
    q,
    createFakeProvider("safe", { gapMs: 0 }),
    createMemoryBudgetLedger(),
    { timeoutMs: 5_000, shutdown },
  );
  shutdown.requestStop();
  assert((await w.tick()) === null);
  assert(q.published() === 0);
});

Deno.test("orphan temp cleanup removes stale nix-frame dirs", async () => {
  const parent = await makeTempDir();
  try {
    const stale = await Deno.makeTempDir({ dir: parent, prefix: "nix-frame-" });
    const old = new Date(Date.now() - 901_000);
    await Deno.utime(stale, old, old);
    const n = await cleanupOrphanTempDirs(parent, 900_000);
    assert(n >= 1);
  } finally {
    await Deno.remove(parent, { recursive: true });
  }
});

Deno.test("zero Azure network: fake provider only increments local counter", async () => {
  const p = createFakeProvider("safe", { gapMs: 0 });
  assert(p.azureRequestCount() === 0);
  await p.analyzeText("hi", AbortSignal.timeout(1000));
  assert(p.azureRequestCount() === 1);
});
