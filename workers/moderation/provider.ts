import type { ProviderAnalysis } from "../../supabase/functions/_shared/moderation-policy.ts";

/** Shared Azure-shaped provider used by fake tests and the live F0 client. */
export type ModerationProvider = {
  analyzeText: (
    text: string,
    signal: AbortSignal,
  ) => Promise<ProviderAnalysis>;
  analyzeImage: (
    bytes: Uint8Array,
    signal: AbortSignal,
  ) => Promise<ProviderAnalysis>;
  asFrameProvider: () => (
    frame: Uint8Array,
    signal: AbortSignal,
  ) => Promise<ProviderAnalysis>;
  azureRequestCount: () => number;
  reset: () => void;
};
