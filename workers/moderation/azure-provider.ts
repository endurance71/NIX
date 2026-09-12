import type { ProviderAnalysis } from "../../supabase/functions/_shared/moderation-policy.ts";
import { F0_MIN_REQUEST_GAP_MS } from "./constants.ts";
import type { ModerationProvider } from "./provider.ts";

export const AZURE_ANALYZE_API_VERSION = "2024-09-01";
export const AZURE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

export type AzureFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type AzureProviderOptions = {
  endpoint: string;
  key: string;
  fetchImpl?: AzureFetch;
  gapMs?: number;
};

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("job_timeout"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function analyzeUrl(endpoint: string, kind: "text" | "image"): string {
  const base = endpoint.replace(/\/+$/, "");
  return `${base}/contentsafety/${kind}:analyze?api-version=${AZURE_ANALYZE_API_VERSION}`;
}

function statusError(status: number): Error {
  if (status === 429) {
    return Object.assign(new Error("provider_http_429"), { status });
  }
  if (status >= 500) {
    return Object.assign(new Error("provider_http_5xx"), { status });
  }
  return Object.assign(new Error("provider_failed"), { status });
}

/**
 * Live Azure Content Safety F0 client. Fail-closed: non-OK HTTP never returns
 * a synthetic allow. Callers must not log bodies, paths, or the API key.
 */
export function createAzureProvider(
  options: AzureProviderOptions,
): ModerationProvider {
  const endpoint = options.endpoint.trim();
  const key = options.key.trim();
  if (!endpoint || !key) {
    throw new Error("azure_provider_missing_credentials");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const gapMs = options.gapMs ?? F0_MIN_REQUEST_GAP_MS;
  let calls = 0;
  let lastAt = 0;

  async function gate(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const wait = Math.max(0, gapMs - (Date.now() - lastAt));
    if (wait > 0) await sleep(wait, signal);
    lastAt = Date.now();
  }

  async function post(
    kind: "text" | "image",
    body: unknown,
    signal: AbortSignal,
  ): Promise<ProviderAnalysis> {
    await gate(signal);
    calls += 1;
    const response = await fetchImpl(analyzeUrl(endpoint, kind), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": key,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      throw statusError(response.status);
    }
    const analysis = await response.json() as ProviderAnalysis;
    return analysis;
  }

  return {
    async analyzeText(text, signal) {
      return await post("text", {
        text,
        categories: ["Hate", "SelfHarm", "Sexual", "Violence"],
        outputType: "FourSeverityLevels",
      }, signal);
    },
    async analyzeImage(bytes, signal) {
      if (bytes.byteLength > AZURE_IMAGE_MAX_BYTES) {
        throw new Error("provider_failed");
      }
      return await post("image", {
        image: { content: bytesToBase64(bytes) },
        categories: ["Hate", "SelfHarm", "Sexual", "Violence"],
        outputType: "FourSeverityLevels",
      }, signal);
    },
    asFrameProvider() {
      return (frame, signal) => this.analyzeImage(frame, signal);
    },
    azureRequestCount: () => calls,
    reset: () => {
      calls = 0;
      lastAt = 0;
    },
  };
}

export function requireLiveWorkerEnv(
  env: Record<string, string | undefined>,
): {
  azureEndpoint: string;
  azureKey: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  externalUsed: number;
} {
  const azureEndpoint = env.AZURE_CONTENT_SAFETY_ENDPOINT?.trim() ?? "";
  const azureKey = env.AZURE_CONTENT_SAFETY_KEY?.trim() ?? "";
  const supabaseUrl = env.SUPABASE_URL?.trim() ?? "";
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!azureEndpoint || !azureKey || !supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("live_worker_missing_env");
  }
  const externalUsedRaw = env.MODERATION_EXTERNAL_USED?.trim() ?? "0";
  const externalUsed = Number(externalUsedRaw);
  if (!Number.isInteger(externalUsed) || externalUsed < 0) {
    throw new Error("invalid_MODERATION_EXTERNAL_USED");
  }
  return {
    azureEndpoint,
    azureKey,
    supabaseUrl,
    supabaseServiceRoleKey,
    externalUsed,
  };
}
