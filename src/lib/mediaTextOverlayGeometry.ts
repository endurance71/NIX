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
