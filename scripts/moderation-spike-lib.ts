/** Shared helpers for Azure moderation spikes (testable, no network). */

export const F0_MONTHLY_CAP = 5000;
/** Soft operational ceiling: leave 1000 txn as untouchable reserve. */
export const F0_HARD_BUDGET = 4000;
/** One-off S0 C2 experiment ceiling; this is not a production allowance. */
export const S0_EXPERIMENT_HARD_BUDGET = 2500;
export const RETRY_RESERVE_RATIO = 0.1;
/** Backward-compatible export used by the historical F0 tests. */
export const F0_RETRY_RESERVE_RATIO = RETRY_RESERVE_RATIO;

export type SpikeMode = "text" | "image" | "video" | "all";
export type ExpectedDecision = "approved" | "rejected";
export type SpikeBillingTier = "F0" | "S0";

export function parseBillingTier(
  raw: string | undefined | null,
): SpikeBillingTier {
  const value = (raw ?? "F0").trim().toUpperCase();
  if (value === "F0" || value === "S0") return value;
  throw new Error(`invalid_SPIKE_BILLING_TIER=${raw}`);
}

export function hardBudgetForTier(tier: SpikeBillingTier): number {
  return tier === "F0" ? F0_HARD_BUDGET : S0_EXPERIMENT_HARD_BUDGET;
}

export function parseCaseSet(raw: string | undefined | null): string {
  const value = (raw ?? "unspecified").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)) {
    throw new Error(`invalid_SPIKE_CASE_SET=${raw}`);
  }
  return value;
}

export function videoLeaseFitsBatch(
  p95VideoDecisionMs: number,
  batchSize = 5,
  leaseMs = 900_000,
  safetyFactor = 1.2,
): boolean {
  return p95VideoDecisionMs * batchSize * safetyFactor < leaseMs;
}

export function parseSpikeMode(raw: string | undefined | null): SpikeMode {
  const value = (raw ?? "all").trim().toLowerCase();
  if (
    value === "text" || value === "image" || value === "video" ||
    value === "all"
  ) return value;
  throw new Error(`invalid_SPIKE_MODE=${raw}`);
}

export function parseExpectedDecision(
  raw: string | undefined | null,
): ExpectedDecision | null {
  if (raw == null || raw.trim() === "") return null;
  const value = raw.trim().toLowerCase();
  if (value === "approved" || value === "rejected") return value;
  throw new Error(`invalid_expected_decision=${raw}`);
}

export function assertExpectedDecision(
  sampleId: string,
  actual: string,
  expected: ExpectedDecision | null,
  maxSeverity: number | null,
): void {
  if (expected == null) return;
  if (actual !== expected) {
    throw new Error(
      `expected_decision_mismatch id=${sampleId} expected=${expected} actual=${actual} maxSeverity=${maxSeverity}`,
    );
  }
  if (expected === "rejected" && (maxSeverity == null || maxSeverity < 4)) {
    throw new Error(
      `expected_reject_severity id=${sampleId} maxSeverity=${maxSeverity} (need >=4)`,
    );
  }
}

export function estimateWithRetryReserve(estimate: number): number {
  return Math.ceil(estimate * (1 + RETRY_RESERVE_RATIO));
}

export function budgetRemaining(
  usedBefore: number,
  hardBudget = F0_HARD_BUDGET,
): number {
  return hardBudget - usedBefore;
}

export function canAffordLiveRun(
  usedBefore: number,
  estimate: number,
  hardBudget = F0_HARD_BUDGET,
): {
  ok: boolean;
  usedBefore: number;
  estimate: number;
  withReserve: number;
  projected: number;
  hardBudget: number;
  remaining: number;
} {
  const withReserve = estimateWithRetryReserve(estimate);
  const projected = usedBefore + withReserve;
  const remaining = budgetRemaining(usedBefore, hardBudget);
  return {
    ok: projected <= hardBudget,
    usedBefore,
    estimate,
    withReserve,
    projected,
    hardBudget,
    remaining,
  };
}

export function requireBudgetBeforeRequest(
  usedBefore: number,
  transactionsSoFar: number,
  hardBudget = F0_HARD_BUDGET,
): void {
  const projected = usedBefore + transactionsSoFar + 1;
  if (projected > hardBudget) {
    throw new Error(
      `transaction_hard_budget_blocked used_before=${usedBefore} so_far=${transactionsSoFar} next=${projected} hard=${hardBudget}`,
    );
  }
}

export function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = (p / 100) * (sortedAsc.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sortedAsc[low];
  const weight = rank - low;
  return sortedAsc[low] * (1 - weight) + sortedAsc[high] * weight;
}

export function p95(latenciesMs: number[]): number | null {
  if (latenciesMs.length === 0) return null;
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  return percentile(sorted, 95);
}

const FORBIDDEN_JSONL_KEYS = new Set([
  "text",
  "body",
  "content",
  "path",
  "paths",
  "url",
  "urls",
  "signed_url",
  "signedUrl",
  "key",
  "api_key",
  "apiKey",
  "endpoint",
  "raw",
  "response",
  "payload",
  "image",
  "frames_bytes",
]);

export function sanitizeSpikeRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (FORBIDDEN_JSONL_KEYS.has(key)) continue;
    if (typeof value === "string") {
      if (/cognitiveservices\.azure\.com/i.test(value)) continue;
      if (/^https?:\/\//i.test(value)) continue;
      if (
        value.includes("/") &&
        (value.includes(".mp4") || value.includes(".jpg") ||
          value.includes("nix-ops"))
      ) {
        continue;
      }
    }
    out[key] = value;
  }
  return out;
}

export function monthlyForecastTxn(input: {
  textMessages30d: number;
  uniquePhotos30d: number;
  uniqueVideos30d: number;
  textMessages7d: number;
  uniquePhotos7d: number;
  uniqueVideos7d: number;
  videoTxnPerClip: number;
}): {
  text: number;
  photos: number;
  videos: number;
  total: number;
  with20pctBuffer: number;
  withinHardBudget: boolean;
} {
  const scale7to30 = (n: number) => Math.ceil((n / 7) * 30);
  const text = Math.max(
    input.textMessages30d,
    scale7to30(input.textMessages7d),
  );
  const photos = Math.max(
    input.uniquePhotos30d,
    scale7to30(input.uniquePhotos7d),
  );
  const videos = Math.max(
    input.uniqueVideos30d,
    scale7to30(input.uniqueVideos7d),
  );
  const total = text * 1 + photos * 1 + videos * input.videoTxnPerClip;
  const with20pctBuffer = Math.ceil(total * 1.2);
  return {
    text,
    photos,
    videos,
    total,
    with20pctBuffer,
    withinHardBudget: with20pctBuffer <= F0_HARD_BUDGET,
  };
}
