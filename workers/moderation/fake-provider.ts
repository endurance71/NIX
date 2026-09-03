import type { ProviderAnalysis } from "../../supabase/functions/_shared/moderation-policy.ts";
import { F0_MIN_REQUEST_GAP_MS } from "./constants.ts";

export type FakeMode =
  | "safe"
  | "reject"
  | "timeout"
  | "http_429"
  | "http_5xx"
  | "invalid";

export type FakeProvider = {
  analyzeText: (
    text: string,
    signal: AbortSignal,
  ) => Promise<ProviderAnalysis>;
  analyzeImage: (
    bytes: Uint8Array,
    signal: AbortSignal,
  ) => Promise<ProviderAnalysis>;
  /** Frame provider compatible with video.ts */
  asFrameProvider: () => (
    frame: Uint8Array,
    signal: AbortSignal,
  ) => Promise<ProviderAnalysis>;
  azureRequestCount: () => number;
  reset: () => void;
};

const SAFE: ProviderAnalysis = {
  categoriesAnalysis: [
    { category: "Hate", severity: 0 },
    { category: "SelfHarm", severity: 0 },
    { category: "Sexual", severity: 0 },
    { category: "Violence", severity: 0 },
  ],
};

const REJECT: ProviderAnalysis = {
  categoriesAnalysis: [
    { category: "Hate", severity: 0 },
    { category: "SelfHarm", severity: 0 },
    { category: "Sexual", severity: 6 },
    { category: "Violence", severity: 0 },
  ],
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

/**
 * Deterministic offline Azure stand-in. Never opens network sockets.
 * Counts logical transactions the same way live F0 would bill.
 */
export function createFakeProvider(
  mode: FakeMode = "safe",
  options: { gapMs?: number; rejectSubstring?: string } = {},
): FakeProvider {
  let calls = 0;
  let lastAt = 0;
  const gapMs = options.gapMs ?? F0_MIN_REQUEST_GAP_MS;
  const rejectSubstring = options.rejectSubstring ?? "REJECT_ME";

  async function gate(signal: AbortSignal): Promise<ProviderAnalysis> {
    signal.throwIfAborted();
    const now = Date.now();
    const wait = Math.max(0, gapMs - (now - lastAt));
    if (wait > 0) await sleep(wait, signal);
    lastAt = Date.now();
    calls += 1;
    signal.throwIfAborted();

    switch (mode) {
      case "safe":
        return SAFE;
      case "reject":
        return REJECT;
      case "timeout":
        await sleep(60_000, signal);
        throw new Error("job_timeout");
      case "http_429":
        throw Object.assign(new Error("provider_http_429"), { status: 429 });
      case "http_5xx":
        throw Object.assign(new Error("provider_http_5xx"), { status: 503 });
      case "invalid":
        return { categoriesAnalysis: null };
      default: {
        const _exhaustive: never = mode;
        throw new Error(`unknown_mode_${_exhaustive}`);
      }
    }
  }

  return {
    async analyzeText(text, signal) {
      if (mode === "safe" && text.includes(rejectSubstring)) {
        calls += 1;
        return REJECT;
      }
      return gate(signal);
    },
    async analyzeImage(_bytes, signal) {
      return gate(signal);
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
