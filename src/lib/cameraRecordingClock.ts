/** "mm:ss" for the recording pill (Camera app style: 00:07, 03:00). Negative / NaN → 00:00. */
export function formatRecordingClock(ms: number): string {
  const totalSeconds = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** 0–1 share of the maximum recording length, for the ring around the shutter. */
export function recordingProgress(elapsedMs: number, maxMs: number): number {
  'worklet';
  if (!(maxMs > 0) || !(elapsedMs > 0)) return 0;
  return Math.min(1, elapsedMs / maxMs);
}
