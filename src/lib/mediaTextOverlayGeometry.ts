/**
 * Maps a normalized Y (0–1) within a cover-cropped viewport onto full media pixel Y.
 * Matches React Native / expo-image `contentFit: "cover"` framing.
 */
export function mapCoverNormalizedYToMediaY(params: {
  mediaWidth: number;
  mediaHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  normalizedY: number;
}): number {
  const { mediaWidth, mediaHeight, viewportWidth, viewportHeight, normalizedY } = params;
  if (
    mediaWidth <= 0
    || mediaHeight <= 0
    || viewportWidth <= 0
    || viewportHeight <= 0
  ) {
    return mediaHeight * clamp01(normalizedY);
  }

  const mediaAspect = mediaWidth / mediaHeight;
  const viewportAspect = viewportWidth / viewportHeight;

  let visibleTop = 0;
  let visibleHeight = mediaHeight;

  if (mediaAspect > viewportAspect) {
    // Media wider than viewport — horizontal crop, full height visible.
    visibleTop = 0;
    visibleHeight = mediaHeight;
  } else {
    // Media taller than viewport — vertical crop.
    const scale = mediaWidth / viewportWidth;
    visibleHeight = viewportHeight * scale;
    visibleTop = (mediaHeight - visibleHeight) / 2;
  }

  return visibleTop + visibleHeight * clamp01(normalizedY);
}

export function mapCoverFontSizeToMedia(params: {
  mediaWidth: number;
  mediaHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  fontSizePoints: number;
}): number {
  const { mediaWidth, mediaHeight, viewportWidth, viewportHeight, fontSizePoints } = params;
  if (viewportHeight <= 0 || mediaHeight <= 0 || mediaWidth <= 0 || viewportWidth <= 0) {
    return fontSizePoints;
  }
  const mediaAspect = mediaWidth / mediaHeight;
  const viewportAspect = viewportWidth / viewportHeight;
  const scale =
    mediaAspect > viewportAspect
      ? mediaHeight / viewportHeight
      : mediaWidth / viewportWidth;
  return Math.max(1, fontSizePoints * scale);
}

export function clampPreviewTextTopPx(topPx: number, minTopPx: number, maxTopPx: number): number {
  return Math.max(minTopPx, Math.min(maxTopPx, topPx));
}

export function previewTextTopAboveObstacle(params: {
  windowHeight: number;
  obstacleHeight: number;
  minTopPx: number;
  maxTopPx: number;
  stickerReservePx: number;
  gapPx: number;
}): number {
  const {
    windowHeight,
    obstacleHeight,
    minTopPx,
    maxTopPx,
    stickerReservePx,
    gapPx,
  } = params;
  return clampPreviewTextTopPx(
    windowHeight - Math.max(0, obstacleHeight) - stickerReservePx - gapPx,
    minTopPx,
    maxTopPx
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}
