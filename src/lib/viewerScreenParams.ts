import { normalizeNixViewDurationSec } from './nixViewDuration';

function paramFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function normalizeViewerScreenParams(
  raw: Partial<
    Record<
      | 'id'
      | 'path'
      | 'senderId'
      | 'viewDurationSec'
      | 'mediaType'
      | 'playbackDurationMs'
      | 'thumbnailB64'
      | 'isReplay',
      string | string[]
    >
  >,
) {
  const paramId = paramFirst(raw.id);
  const paramPath = paramFirst(raw.path);
  const paramSenderId = paramFirst(raw.senderId);
  const paramViewDurationSec = normalizeNixViewDurationSec(paramFirst(raw.viewDurationSec));
  const paramMediaType = paramFirst(raw.mediaType) === 'video' ? 'video' : 'image';
  const rawPlaybackDurationMs = Number(paramFirst(raw.playbackDurationMs));
  const paramPlaybackDurationMs =
    Number.isFinite(rawPlaybackDurationMs) && rawPlaybackDurationMs > 0
      ? rawPlaybackDurationMs
      : null;
  const paramThumbnailB64 = paramFirst(raw.thumbnailB64) || null;
  const paramIsReplay = paramFirst(raw.isReplay) === '1';
  return {
    paramId,
    paramPath,
    paramSenderId,
    paramViewDurationSec,
    paramMediaType,
    paramPlaybackDurationMs,
    paramThumbnailB64,
    paramIsReplay,
  };
}
