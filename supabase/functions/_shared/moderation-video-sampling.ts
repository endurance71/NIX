/** Frame sampling for Sprint 3A. Not a vendor video API. */

export const SPIKE_DURATIONS_SEC = [15, 60, 180] as const;

export type SamplingStrategy =
  | "baseline_1fps"
  | "uniform"
  | "uniform_scene_guard"
  | "scene_plus_anchors"
  | "contact_sheet";

export const MAX_SCENE_GUARD_FRAMES = 120;
export const SCENE_GUARD_OFFSETS_SEC = [-0.75, -0.25, 0, 0.25] as const;

export function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value * 1000) / 1000))]
    .sort((a, b) => a - b);
}

export function anchorTimestamps(durationSec: number): number[] {
  if (!(durationSec > 0)) return [0];
  const end = Math.max(0, durationSec - 0.05);
  return uniqueSorted([0, durationSec / 2, end]);
}

export function baselineTimestamps(durationSec: number): number[] {
  const frames = Math.min(180, Math.max(1, Math.ceil(durationSec)));
  return Array.from({ length: frames }, (_, index) => index);
}

export function uniformCount(durationSec: number): number {
  if (durationSec <= 15) return 12;
  if (durationSec <= 60) return 24;
  return 60;
}

export function uniformTimestamps(durationSec: number): number[] {
  const count = uniformCount(durationSec);
  if (count <= 1) return [0];
  const last = Math.max(0, durationSec - 0.05);
  const stamps = Array.from(
    { length: count },
    (_, index) => (index / (count - 1)) * last,
  );
  return uniqueSorted([...stamps, ...anchorTimestamps(durationSec)]);
}

export function scenePlusAnchorTimestamps(
  durationSec: number,
  sceneTimes: number[],
): number[] {
  return uniqueSorted([
    ...anchorTimestamps(durationSec),
    ...sceneTimes.filter((time) => time >= 0 && time <= durationSec),
  ]);
}

export function uniformSceneGuardTimestamps(
  durationSec: number,
  sceneTimes: number[],
): number[] {
  const last = Math.max(0, durationSec - 0.05);
  const guards = sceneTimes.flatMap((time) =>
    SCENE_GUARD_OFFSETS_SEC.map((offset) =>
      Math.min(last, Math.max(0, time + offset))
    )
  );
  const timestamps = uniqueSorted([
    ...uniformTimestamps(durationSec),
    ...guards,
  ]);
  if (timestamps.length > MAX_SCENE_GUARD_FRAMES) {
    throw new Error("excessive_scene_changes");
  }
  return timestamps;
}

export function describeTimelineCoverage(
  timestamps: number[],
  durationSec: number,
  strategy: SamplingStrategy,
) {
  const hasStart = timestamps.some((time) => time <= 0.25);
  const hasMid = timestamps.some((time) =>
    Math.abs(time - durationSec / 2) <= Math.max(0.5, durationSec * 0.08)
  );
  // Last-second coverage: integer 1fps ends at floor(duration)-0..1, which can sit
  // just under 0.9*duration for sub-second lengths like 14.9s.
  const hasEnd = timestamps.some((time) =>
    time >= Math.max(0, durationSec - 1.05)
  );
  const baseline = baselineTimestamps(durationSec);
  // Only the intentional baseline_1fps strategy may claim full-timeline coverage.
  // Uniform/scene/contact_sheet can meet or exceed frame count by accident (e.g. 15.4s)
  // and must never be labeled as a full video scan.
  const isBaselineFullTimeline = strategy === "baseline_1fps" &&
    durationSec <= 180 &&
    timestamps.length === baseline.length &&
    hasStart &&
    hasEnd;
  return {
    hasStart,
    hasMid,
    hasEnd,
    frameCount: timestamps.length,
    isBaselineFullTimeline,
    coverageClaim: isBaselineFullTimeline
      ? "baseline_1fps_full_timeline"
      : "sampled_timeline_not_a_full_video_scan",
  };
}

export function contactSheetGrid(
  frameCount: number,
): { cols: number; rows: number } {
  const count = Math.max(1, frameCount);
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

export function azureImageTransactions(
  strategy: SamplingStrategy,
  frameCount: number,
): number {
  if (strategy === "contact_sheet") return frameCount === 0 ? 0 : 1;
  return frameCount;
}

export function timestampsForStrategy(
  strategy: SamplingStrategy,
  durationSec: number,
  sceneTimes: number[] = [],
): number[] {
  switch (strategy) {
    case "baseline_1fps":
      return baselineTimestamps(durationSec);
    case "uniform":
    case "contact_sheet":
      return uniformTimestamps(durationSec);
    case "uniform_scene_guard":
      return uniformSceneGuardTimestamps(durationSec, sceneTimes);
    case "scene_plus_anchors":
      return scenePlusAnchorTimestamps(durationSec, sceneTimes);
    default: {
      const unexpected: never = strategy;
      throw new Error(`unsupported sampling strategy: ${unexpected}`);
    }
  }
}

/** Worker default is uniform (not a full scan, not a single thumbnail). */
export function resolveWorkerSamplingStrategy(
  raw: string | undefined | null,
): SamplingStrategy {
  const value = raw?.trim() || "uniform";
  if (
    value === "baseline_1fps" ||
    value === "uniform" ||
    value === "uniform_scene_guard" ||
    value === "scene_plus_anchors" ||
    value === "contact_sheet"
  ) {
    return value;
  }
  throw new Error("invalid_video_sampling_strategy");
}
