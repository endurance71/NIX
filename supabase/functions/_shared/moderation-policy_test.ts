import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decideFromProviderAnalysis,
  decisionFromHttpStatus,
  POLICY_VERSION,
  worsePolicyResult,
} from "./moderation-policy.ts";

const azureDocsAllow = {
  categoriesAnalysis: [
    { category: "Hate" as const, severity: 2 },
    { category: "SelfHarm" as const, severity: 0 },
    { category: "Sexual" as const, severity: 0 },
    { category: "Violence" as const, severity: 0 },
  ],
};

const syntheticReject = {
  categoriesAnalysis: [
    { category: "Hate" as const, severity: 0 },
    { category: "SelfHarm" as const, severity: 0 },
    { category: "Sexual" as const, severity: 6 },
    { category: "Violence" as const, severity: 0 },
  ],
};

const syntheticReview = {
  categoriesAnalysis: [
    { category: "Hate" as const, severity: 0 },
    { category: "SelfHarm" as const, severity: 0 },
    { category: "Sexual" as const, severity: 0 },
    { category: "Violence" as const, severity: 4 },
  ],
};

Deno.test("Azure docs allow fixture is approved", () => {
  const result = decideFromProviderAnalysis(azureDocsAllow);
  assertEquals(result.decision, "approved");
  assertEquals(result.maxSeverity, 2);
  assertEquals(result.policyVersion, POLICY_VERSION);
});

Deno.test("synthetic sexual 6 is rejected", () => {
  const result = decideFromProviderAnalysis(syntheticReject);
  assertEquals(result.decision, "rejected");
  assertEquals(result.maxSeverity, 6);
});

Deno.test("severity 4 is rejected when human review is off", () => {
  const result = decideFromProviderAnalysis(syntheticReview, {
    humanReviewEnabled: false,
  });
  assertEquals(result.decision, "rejected");
});

Deno.test("severity 4 is review_required when human review is on", () => {
  const result = decideFromProviderAnalysis(syntheticReview, {
    humanReviewEnabled: true,
  });
  assertEquals(result.decision, "review_required");
});

Deno.test("missing analysis is error never approved", () => {
  assertEquals(decideFromProviderAnalysis(null).decision, "error");
  assertEquals(decideFromProviderAnalysis({}).decision, "error");
});

Deno.test("provider HTTP failures never map to approved", () => {
  assertEquals(decisionFromHttpStatus(401), "error");
  assertEquals(decisionFromHttpStatus(429), "error");
  assertEquals(decisionFromHttpStatus(500), "error");
  assertEquals(decisionFromHttpStatus(200), null);
});

Deno.test("worsePolicyResult never lets approve beat reject or error", () => {
  const approved = decideFromProviderAnalysis(azureDocsAllow);
  const rejected = decideFromProviderAnalysis(syntheticReject);
  const errored = decideFromProviderAnalysis(null);
  assertEquals(worsePolicyResult(approved, rejected).decision, "rejected");
  assertEquals(worsePolicyResult(rejected, approved).decision, "rejected");
  assertEquals(worsePolicyResult(approved, errored).decision, "error");
  assertEquals(worsePolicyResult(errored, rejected).decision, "error");
});
