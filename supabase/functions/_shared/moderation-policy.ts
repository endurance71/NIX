export const POLICY_VERSION = "2026.08.27-p0" as const;

export type HarmCategory = "Hate" | "SelfHarm" | "Sexual" | "Violence";
export type ModerationDecision =
  | "approved"
  | "review_required"
  | "rejected"
  | "error";

export type CategoryScore = {
  category: HarmCategory;
  severity: number;
};

export type ProviderAnalysis = {
  categoriesAnalysis?: CategoryScore[] | null;
};

const HARM_CATEGORIES: readonly HarmCategory[] = [
  "Hate",
  "SelfHarm",
  "Sexual",
  "Violence",
];

export function maxSeverity(
  analysis: ProviderAnalysis | null | undefined,
): number | null {
  const rows = analysis?.categoriesAnalysis;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let max = 0;
  let seen = false;
  for (const row of rows) {
    if (!HARM_CATEGORIES.includes(row.category)) continue;
    if (!Number.isFinite(row.severity)) return null;
    seen = true;
    if (row.severity > max) max = row.severity;
  }
  return seen ? max : null;
}

export function decideFromProviderAnalysis(
  analysis: ProviderAnalysis | null | undefined,
  options: { humanReviewEnabled?: boolean } = {},
): {
  decision: ModerationDecision;
  maxSeverity: number | null;
  policyVersion: typeof POLICY_VERSION;
} {
  // Sprint 3A/3B: human review stays off. Severity 4 is rejected until an SLA owner exists.
  const severity = maxSeverity(analysis);
  if (severity === null) {
    return {
      decision: "error",
      maxSeverity: null,
      policyVersion: POLICY_VERSION,
    };
  }
  if (severity >= 6) {
    return {
      decision: "rejected",
      maxSeverity: severity,
      policyVersion: POLICY_VERSION,
    };
  }
  if (severity >= 4) {
    const decision: ModerationDecision = options.humanReviewEnabled
      ? "review_required"
      : "rejected";
    return { decision, maxSeverity: severity, policyVersion: POLICY_VERSION };
  }
  return {
    decision: "approved",
    maxSeverity: severity,
    policyVersion: POLICY_VERSION,
  };
}

export function decisionFromHttpStatus(
  status: number,
): ModerationDecision | null {
  if (status === 401 || status === 403) return "error";
  if (status === 429 || status >= 500) return "error";
  return null;
}

const DECISION_RANK: Record<ModerationDecision, number> = {
  approved: 0,
  review_required: 1,
  rejected: 2,
  error: 3,
};

export type PolicyResult = ReturnType<typeof decideFromProviderAnalysis>;

/** Combine per-frame/text results. Error and reject always beat approve. */
export function worsePolicyResult(
  left: PolicyResult,
  right: PolicyResult,
): PolicyResult {
  if (DECISION_RANK[right.decision] > DECISION_RANK[left.decision]) {
    return right;
  }
  if (DECISION_RANK[right.decision] < DECISION_RANK[left.decision]) return left;
  const leftSeverity = left.maxSeverity ?? -1;
  const rightSeverity = right.maxSeverity ?? -1;
  return rightSeverity > leftSeverity ? right : left;
}
