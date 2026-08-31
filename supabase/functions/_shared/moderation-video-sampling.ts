/** Frame sampling for Sprint 3A. Not a vendor video API. */

export const SPIKE_DURATIONS_SEC = [15, 60, 180] as const;

export type SamplingStrategy = 'baseline_1fps' | 'uniform' | 'scene_plus_anchors' | 'contact_sheet';

export function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value * 1000) / 1000))].sort((a, b) => a - b);
}

export function anchorTimestamps(durationSec: number): number[] {
  if (!(durationSec > 0)) return [0];
  const end = Math.max(0, durationSec - 0.05);
  return uniqueSorted([0, durationSec / 2, end]);
}

export function baselineTimestamps(durationSec: number): number[] {
  const frames = Math.max(1, Math.floor(durationSec));
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
  const stamps = Array.from({ length: count }, (_, index) => (index / (count - 1)) * last);
  return uniqueSorted([...stamps, ...anchorTimestamps(durationSec)]);
}

export function scenePlusAnchorTimestamps(durationSec: number, sceneTimes: number[]): number[] {
  return uniqueSorted([...anchorTimestamps(durationSec), ...sceneTimes.filter((time) => time >= 0 && time <= durationSec)]);
}

export function describeTimelineCoverage(timestamps: number[], durationSec: number) {
  const hasStart = timestamps.some((time) => time <= 0.25);
  const hasMid = timestamps.some((time) => Math.abs(time - durationSec / 2) <= Math.max(0.5, durationSec * 0.08));
  const hasEnd = timestamps.some((time) => time >= durationSec * 0.9);
  const baseline = baselineTimestamps(durationSec);
  const isBaselineFullTimeline = timestamps.length >= baseline.length && hasStart && hasEnd;
  return {
    hasStart,
    hasMid,
    hasEnd,
    frameCount: timestamps.length,
    isBaselineFullTimeline,
    coverageClaim: isBaselineFullTimeline
      ? 'baseline_1fps_full_timeline'
      : 'sampled_timeline_not_a_full_video_scan',
  };
}

export function contactSheetGrid(frameCount: number): { cols: number; rows: number } {
  const count = Math.max(1, frameCount);
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

export function azureImageTransactions(strategy: SamplingStrategy, frameCount: number): number {
  if (strategy === 'contact_sheet') return frameCount === 0 ? 0 : 1;
  return frameCount;
}
