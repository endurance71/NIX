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

/**
 * Caption `y` is the bar's centre as a fraction of the visible media frame — the native bake
 * draws `centerY = visible.minY + visible.height * y`. These convert between that and the
 * sticker's top edge in the editing layer, so the preview and the sent NiX match.
 */
export type CaptionFrame = { top: number; height: number };

export function captionTopPxFromY(y: number, frame: CaptionFrame, barHeight: number): number {
  return frame.top + y * Math.max(1, frame.height) - barHeight / 2;
}

export function captionYFromTopPx(topPx: number, frame: CaptionFrame, barHeight: number): number {
  return (topPx + barHeight / 2 - frame.top) / Math.max(1, frame.height);
}
