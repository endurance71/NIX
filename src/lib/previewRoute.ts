import type { VideoSegmentDraft } from '../context/videoDraft';

export function paramFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function decodeParamUri(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function routeVideoSegment(
  mode: string | undefined,
  uri: string | undefined,
  durationMs: string | undefined,
): VideoSegmentDraft | null {
  return mode === 'video' && uri
    ? { uri, durationMs: Math.round(Math.max(0, Number(durationMs) || 0)) }
    : null;
}

export function resolvePreviewVideoSegments(
  segments: VideoSegmentDraft[] | null,
  mode: string | undefined,
  uri: string | undefined,
  durationMs: string | undefined,
) {
  const fallback = routeVideoSegment(mode, uri, durationMs);
  return segments?.length ? segments : fallback ? [fallback] : null;
}
