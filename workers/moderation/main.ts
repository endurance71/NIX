import {
  F0_HARD_BUDGET,
  F0_MIN_REQUEST_GAP_MS,
  TRANSIENT_PROVIDER_ERRORS,
  WAITING_BUDGET,
} from "./constants.ts";
import { createAzureProvider, requireLiveWorkerEnv } from "./azure-provider.ts";
import { createIntegrationWorker } from "./core.ts";
import {
  downloadMediaVaultObject,
  jobDestPath,
  jobTempDir,
  loadMediaAsset,
  InputResolutionError,
} from "./download.ts";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "../../supabase/functions/_shared/media-limits.ts";
import { integrationRpcQueue, type Rpc } from "./rpc-queue.ts";
import { createShutdownController, type ShutdownController } from "./shutdown.ts";
import type { ProcessOutcome } from "./process.ts";
import { sqlBudgetLedger } from "./sql-budget.ts";

const TICK_IDLE_MS = 1000;

/**
 * Whether the loop may claim the next job right away (DB-8). Only a job that
 * finished normally qualifies: an empty queue, a budget deferral, or a transient
 * provider failure (429/5xx/network) all wait TICK_IDLE_MS so an exhausted F0
 * budget or a throttled Azure endpoint is not hammered. The 5 RPS spacing itself
 * lives in the provider (gapMs) and is shared across ticks.
 */
export function shouldContinueImmediately(
  outcome: ProcessOutcome | null,
): boolean {
  if (!outcome) return false;
  if (outcome.waitingReason === WAITING_BUDGET) return false;
  if (
    outcome.decision === "error" && outcome.error &&
    TRANSIENT_PROVIDER_ERRORS.has(outcome.error)
  ) {
    return false;
  }
  return true;
}

export type WorkerLoopOptions = {
  once?: boolean;
  idleMs?: number;
  shutdown: ShutdownController;
  sleep?: (ms: number) => Promise<void>;
  onError?: (message: string) => void;
};

/** Drain due jobs back-to-back; sleep only when idle, deferred or failing. */
export async function runWorkerLoop(
  tick: () => Promise<ProcessOutcome | null>,
  options: WorkerLoopOptions,
): Promise<void> {
  const sleep = options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const onError = options.onError ?? ((message: string) => console.error(message));
  const idleMs = options.idleMs ?? TICK_IDLE_MS;
  do {
    let busy = false;
    try {
      busy = shouldContinueImmediately(await tick());
    } catch (error) {
      onError(error instanceof Error ? error.message : "tick_failed");
    }
    if (options.once) return;
    if (!busy) await sleep(idleMs);
  } while (!options.shutdown.isStopping());
}

export function createSupabaseRpc(
  supabaseUrl: string,
  serviceRoleKey: string,
  fetchImpl: typeof fetch = fetch,
): Rpc {
  const base = supabaseUrl.replace(/\/+$/, "");
  return async (name, args) => {
    const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      return { data: null, error: { status: response.status } };
    }
    return { data: json, error: null };
  };
}

export async function loadTextPayload(
  supabaseUrl: string,
  serviceRoleKey: string,
  payloadId: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (typeof payloadId !== "string" || payloadId.length === 0) {
    throw new InputResolutionError("text_payload_load_failed", false);
  }
  const base = supabaseUrl.replace(/\/+$/, "");
  const url =
    `${base}/rest/v1/moderation_text_payloads?id=eq.${
      encodeURIComponent(payloadId)
    }&select=body`;
  const response = await fetchImpl(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/vnd.pgrst.object+json",
    },
  });
  const json = await response.json().catch(() => null) as { body?: unknown } | null;
  if (!response.ok || typeof json?.body !== "string") {
    throw new InputResolutionError("text_payload_load_failed", response.status === 429 || response.status >= 500);
  }
  return json.body;
}

export type ResolveClaimedJobOptions = {
  fetchImpl?: typeof fetch;
  destDir?: string;
  signal?: AbortSignal;
};

export async function resolveClaimedJob(
  supabaseUrl: string,
  serviceRoleKey: string,
  row: Record<string, unknown>,
  options: ResolveClaimedJobOptions = {},
): Promise<{ path?: string; text?: string; kind?: "text" | "image" | "video" }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (row.content_kind === "text") {
    const text = await loadTextPayload(
      supabaseUrl,
      serviceRoleKey,
      row.text_payload_id,
      fetchImpl,
    );
    return { text, kind: "text" };
  }
  if (row.content_kind !== "media") {
    throw new Error("content_kind_invalid");
  }
  const asset = await loadMediaAsset(
    supabaseUrl,
    serviceRoleKey,
    row.asset_id,
    fetchImpl,
  );
  const destPath = await jobDestPath(jobTempDir(options.destDir), row.id);
  const downloaded = await downloadMediaVaultObject(
    supabaseUrl,
    serviceRoleKey,
    asset.storagePath,
    destPath,
    {
      fetchImpl,
      signal: options.signal,
      knownSize: asset.sizeBytes,
      maxBytes: asset.mediaType === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES,
    },
  );
  return { path: downloaded.path, kind: asset.mediaType };
}

/**
 * Production daemon. Does not enable the DB flag. Exits 2 if secrets are missing.
 */
export async function runLiveWorker(
  env: Record<string, string | undefined>,
  options: { once?: boolean; sleepMs?: number } = {},
): Promise<void> {
  const cfg = requireLiveWorkerEnv(env);
  const provider = createAzureProvider({
    endpoint: cfg.azureEndpoint,
    key: cfg.azureKey,
    gapMs: F0_MIN_REQUEST_GAP_MS,
  });
  const rpc = createSupabaseRpc(cfg.supabaseUrl, cfg.supabaseServiceRoleKey);
  const destDir = env.MODERATION_JOB_TEMP_DIR?.trim() || undefined;
  const queue = integrationRpcQueue(
    rpc,
    (row) =>
      resolveClaimedJob(
        cfg.supabaseUrl,
        cfg.supabaseServiceRoleKey,
        row,
        { destDir },
      ),
  );
  const ledger = sqlBudgetLedger(rpc, {
    hardBudget: F0_HARD_BUDGET,
    externalUsed: cfg.externalUsed,
    externalUsedMonth: cfg.externalUsedMonth,
  });
  const shutdown = createShutdownController();
  const worker = createIntegrationWorker(queue, provider, ledger, { shutdown });
  const once = options.once ?? env.MODERATION_WORKER_ONCE === "1";

  await runWorkerLoop(worker.tick, {
    once,
    idleMs: options.sleepMs,
    shutdown,
  });
}

if (import.meta.main) {
  try {
    await runLiveWorker(Deno.env.toObject());
  } catch (error) {
    const message = error instanceof Error ? error.message : "live_worker_failed";
    console.error(message);
    Deno.exit(message === "live_worker_missing_env" ? 2 : 1);
  }
}
