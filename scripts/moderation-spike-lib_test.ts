import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertExpectedDecision,
  canAffordLiveRun,
  estimateWithRetryReserve,
  F0_HARD_BUDGET,
  monthlyForecastTxn,
  p95,
  parseCaseSet,
  parseSpikeMode,
  requireBudgetBeforeRequest,
  sanitizeSpikeRecord,
  videoLeaseFitsBatch,
} from "./moderation-spike-lib.ts";
import { parseSceneTimes } from "../supabase/functions/_shared/moderation-video-scenes.ts";

Deno.test("parseSpikeMode accepts text|image|video|all", () => {
  assertEquals(parseSpikeMode("text"), "text");
  assertEquals(parseSpikeMode("all"), "all");
  assertThrows(() => parseSpikeMode("jpeg"));
});

Deno.test("case set is stable and safe for evidence identifiers", () => {
  assertEquals(parseCaseSet("HighRisk-Start"), "highrisk-start");
  assertEquals(parseCaseSet(undefined), "unspecified");
  assertThrows(() => parseCaseSet("../secret"));
});

Deno.test("scene parser fails closed on ffmpeg error and reads timestamps", () => {
  assertEquals(parseSceneTimes("x pts_time:1.25 y pts_time:7.5", 0), [
    1.25,
    7.5,
  ]);
  assertThrows(() => parseSceneTimes("", 1));
});

Deno.test("video p95 must fit five claimed jobs with twenty percent margin", () => {
  assertEquals(videoLeaseFitsBatch(100_000), true);
  assertEquals(videoLeaseFitsBatch(150_000), false);
});

Deno.test("assertExpectedDecision fails on mismatch and weak reject severity", () => {
  assertExpectedDecision("ok", "approved", "approved", 0);
  assertThrows(() => assertExpectedDecision("x", "approved", "rejected", 0));
  assertThrows(() => assertExpectedDecision("x", "rejected", "rejected", 2));
  assertExpectedDecision("ok", "rejected", "rejected", 4);
});

Deno.test("dry-run budget gate blocks when used_before + estimate + 10% exceeds 4000", () => {
  const ok = canAffordLiveRun(92, 100);
  assertEquals(ok.ok, true);
  assertEquals(ok.withReserve, estimateWithRetryReserve(100));

  const blocked = canAffordLiveRun(3900, 200);
  assertEquals(blocked.ok, false);
  assertEquals(blocked.projected > F0_HARD_BUDGET, true);
});

Deno.test("requireBudgetBeforeRequest blocks the next request before send", () => {
  requireBudgetBeforeRequest(3990, 9);
  assertThrows(() => requireBudgetBeforeRequest(3990, 10));
});

Deno.test("p95 returns null on empty and interpolates", () => {
  assertEquals(p95([]), null);
  assertEquals(p95([10]), 10);
  const value = p95([10, 20, 30, 40, 50]);
  assertEquals(value != null && value >= 40, true);
});

Deno.test("sanitizeSpikeRecord strips paths urls keys and bodies", () => {
  const clean = sanitizeSpikeRecord({
    sampleId: "pl-safe",
    decision: "approved",
    text: "secret body",
    path: "/Users/me/.nix-ops/p0-3-fixtures/safe.jpg",
    endpoint: "https://nix-content-safety-f0.cognitiveservices.azure.com",
    key: "abc",
    latencyMs: 12,
  });
  assertEquals(clean.sampleId, "pl-safe");
  assertEquals(clean.decision, "approved");
  assertEquals(clean.latencyMs, 12);
  assertEquals("text" in clean, false);
  assertEquals("path" in clean, false);
  assertEquals("endpoint" in clean, false);
  assertEquals("key" in clean, false);
});

Deno.test("monthly forecast uses max of 30d and 7d scaled with 20% buffer", () => {
  const forecast = monthlyForecastTxn({
    textMessages30d: 100,
    uniquePhotos30d: 50,
    uniqueVideos30d: 10,
    textMessages7d: 40,
    uniquePhotos7d: 10,
    uniqueVideos7d: 5,
    videoTxnPerClip: 24,
  });
  // text: max(100, ceil(40/7*30)=172) = 172
  assertEquals(forecast.text, 172);
  assertEquals(forecast.photos, 50);
  // videos: max(10, ceil(5/7*30)=22) = 22 → 22*24 = 528
  assertEquals(forecast.videos, 22);
  assertEquals(forecast.total, 172 + 50 + 528);
  assertEquals(forecast.with20pctBuffer, Math.ceil(forecast.total * 1.2));
});
