import { F0_HARD_BUDGET, F0_MIN_REQUEST_GAP_MS } from "./constants.ts";
import { createAzureProvider, requireLiveWorkerEnv } from "./azure-provider.ts";
import { createIntegrationWorker } from "./core.ts";
import { integrationRpcQueue, type Rpc } from "./rpc-queue.ts";
import { createShutdownController } from "./shutdown.ts";
import { sqlBudgetLedger } from "./sql-budget.ts";

const TICK_IDLE_MS = 1000;

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
    throw new Error("text_payload_load_failed");
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
    throw new Error("text_payload_load_failed");
  }
  return json.body;
}

export async function resolveClaimedJob(
  supabaseUrl: string,
  serviceRoleKey: string,
  row: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ path?: string; text?: string; kind?: "text" | "image" | "video" }> {
  if (row.content_kind === "text") {
    const text = await loadTextPayload(
      supabaseUrl,
      serviceRoleKey,
      row.text_payload_id,
      fetchImpl,
    );
    return { text, kind: "text" };
  }
  // Storage download for image/video is a follow-up. Fail-closed, never approve.
  throw new Error("media_resolve_not_wired");
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
  const queue = integrationRpcQueue(
    rpc,
    (row) =>
      resolveClaimedJob(
        cfg.supabaseUrl,
        cfg.supabaseServiceRoleKey,
        row,
      ),
  );
  const ledger = sqlBudgetLedger(rpc, {
    hardBudget: F0_HARD_BUDGET,
    externalUsed: cfg.externalUsed,
  });
  const shutdown = createShutdownController();
  const worker = createIntegrationWorker(queue, provider, ledger, { shutdown });

  do {
    await worker.tick();
    if (options.once) return;
    await new Promise((resolve) =>
      setTimeout(resolve, options.sleepMs ?? TICK_IDLE_MS)
    );
  } while (!shutdown.isStopping());
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
