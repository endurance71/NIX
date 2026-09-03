import {
  decideFromProviderAnalysis,
  type ProviderAnalysis,
} from "../../supabase/functions/_shared/moderation-policy.ts";
import type { BudgetLedger } from "./budget.ts";
import { WAITING_BUDGET } from "./constants.ts";
import { assertLocalMediaPath } from "./download.ts";
import type { FakeProvider } from "./fake-provider.ts";
import { processVideo } from "./video.ts";

export type ContentKind = "text" | "image" | "video";

export type IntegrationJob = {
  id: string;
  kind: ContentKind;
  /** Local filesystem path for image/video. Never a URL. */
  path?: string;
  text?: string;
};

export type ProcessOutcome = {
  decision: "approved" | "rejected" | "error";
  maxSeverity: number | null;
  error?: string;
  waitingReason?: typeof WAITING_BUDGET;
  providerCalls: number;
};

async function withBudgetedCall(
  ledger: BudgetLedger,
  category: "text" | "image",
  jobId: string,
  attemptId: string,
  signal: AbortSignal,
  call: () => Promise<ProviderAnalysis>,
): Promise<
  | { ok: true; analysis: ProviderAnalysis }
  | { ok: false; waiting: true }
  | { ok: false; waiting: false; error: string }
> {
  signal.throwIfAborted();
  const reserved = await ledger.reserve(category, 1, jobId, attemptId);
  if (!reserved.ok) return { ok: false, waiting: true };

  let sent = false;
  try {
    signal.throwIfAborted();
    const analysisPromise = call();
    sent = true;
    // Once the attempt has started, uncertain failure must not release budget.
    await ledger.confirm(reserved.reservationId);
    const analysis = await analysisPromise;
    signal.throwIfAborted();
    return { ok: true, analysis };
  } catch (error) {
    if (!sent) {
      await ledger.releaseIfUnused(reserved.reservationId);
    }
    const message = error instanceof Error ? error.message : "provider_failed";
    if (message === "job_timeout" || signal.aborted) {
      return { ok: false, waiting: false, error: "job_timeout" };
    }
    if (message.includes("429")) {
      return { ok: false, waiting: false, error: "provider_http_429" };
    }
    if (message.includes("5xx") || message.includes("503")) {
      return { ok: false, waiting: false, error: "provider_http_5xx" };
    }
    return { ok: false, waiting: false, error: "provider_failed" };
  }
}

export async function processIntegrationJob(
  job: IntegrationJob,
  provider: FakeProvider,
  ledger: BudgetLedger,
  signal: AbortSignal,
): Promise<ProcessOutcome> {
  let providerCalls = 0;
  const countCalls = () => {
    providerCalls = provider.azureRequestCount();
  };

  try {
    if (job.kind === "text") {
      if (typeof job.text !== "string") {
        return {
          decision: "error",
          maxSeverity: null,
          error: "payload_missing",
          providerCalls: 0,
        };
      }
      const result = await withBudgetedCall(
        ledger,
        "text",
        job.id,
        `${job.id}-text-1`,
        signal,
        () => provider.analyzeText(job.text!, signal),
      );
      countCalls();
      if (!result.ok && result.waiting) {
        return {
          decision: "error",
          maxSeverity: null,
          error: WAITING_BUDGET,
          waitingReason: WAITING_BUDGET,
          providerCalls,
        };
      }
      if (!result.ok) {
        return {
          decision: "error",
          maxSeverity: null,
          error: result.error,
          providerCalls,
        };
      }
      const decided = decideFromProviderAnalysis(result.analysis);
      if (decided.decision === "error") {
        return {
          decision: "error",
          maxSeverity: null,
          error: "provider_invalid_response",
          providerCalls,
        };
      }
      return {
        decision: decided.decision === "approved" ? "approved" : "rejected",
        maxSeverity: decided.maxSeverity,
        providerCalls,
      };
    }

    if (job.kind === "image") {
      if (!job.path) {
        return {
          decision: "error",
          maxSeverity: null,
          error: "asset_missing",
          providerCalls: 0,
        };
      }
      assertLocalMediaPath(job.path);
      const bytes = await Deno.readFile(job.path);
      const result = await withBudgetedCall(
        ledger,
        "image",
        job.id,
        `${job.id}-image-1`,
        signal,
        () => provider.analyzeImage(bytes, signal),
      );
      countCalls();
      if (!result.ok && result.waiting) {
        return {
          decision: "error",
          maxSeverity: null,
          error: WAITING_BUDGET,
          waitingReason: WAITING_BUDGET,
          providerCalls,
        };
      }
      if (!result.ok) {
        return {
          decision: "error",
          maxSeverity: null,
          error: result.error,
          providerCalls,
        };
      }
      const decided = decideFromProviderAnalysis(result.analysis);
      if (decided.decision === "error") {
        return {
          decision: "error",
          maxSeverity: null,
          error: "provider_invalid_response",
          providerCalls,
        };
      }
      return {
        decision: decided.decision === "approved" ? "approved" : "rejected",
        maxSeverity: decided.maxSeverity,
        providerCalls,
      };
    }

    // video
    if (!job.path) {
      return {
        decision: "error",
        maxSeverity: null,
        error: "asset_missing",
        providerCalls: 0,
      };
    }
    assertLocalMediaPath(job.path);

    const budgetedFrameProvider = async (
      frame: Uint8Array,
      frameSignal: AbortSignal,
    ): Promise<ProviderAnalysis> => {
      const attemptId = `${job.id}-frame-${provider.azureRequestCount() + 1}`;
      const result = await withBudgetedCall(
        ledger,
        "image",
        job.id,
        attemptId,
        frameSignal,
        () => provider.analyzeImage(frame, frameSignal),
      );
      if (!result.ok && result.waiting) {
        throw Object.assign(new Error(WAITING_BUDGET), {
          waitingReason: WAITING_BUDGET,
        });
      }
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.analysis;
    };

    try {
      const videoResult = await processVideo(
        job.path,
        budgetedFrameProvider,
        signal,
      );
      countCalls();
      if (videoResult.decision === "error") {
        return {
          decision: "error",
          maxSeverity: null,
          error: "provider_invalid_response",
          providerCalls,
        };
      }
      return {
        decision: videoResult.decision === "approved" ? "approved" : "rejected",
        maxSeverity: videoResult.maxSeverity,
        providerCalls,
      };
    } catch (error) {
      countCalls();
      const message = error instanceof Error ? error.message : "processing_failed";
      if (message === WAITING_BUDGET) {
        return {
          decision: "error",
          maxSeverity: null,
          error: WAITING_BUDGET,
          waitingReason: WAITING_BUDGET,
          providerCalls,
        };
      }
      throw error;
    }
  } catch (error) {
    countCalls();
    const message = error instanceof Error ? error.message : "processing_failed";
    return {
      decision: "error",
      maxSeverity: null,
      error: signal.aborted || message === "job_timeout"
        ? "job_timeout"
        : message.startsWith("input_") || message.startsWith("duration_") ||
            message.includes("corrupt") || message === "subprocess_failed"
        ? message
        : "processing_failed",
      providerCalls,
    };
  }
}
