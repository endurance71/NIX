import {
  MEDIA_TEXT_CAPTION_BAR_FONT_SIZE,
  MEDIA_TEXT_CAPTION_BAR_LINE_HEIGHT_FACTOR,
  MEDIA_TEXT_CAPTION_BAR_PADDING_V,
  type MediaTextVariant,
} from '../types/mediaTextOverlay';

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

/**
 * Height the caption keeps before (and while) its text is laid out. The caption bar matches
 * the bake's strip: one line of the fixed font plus the vertical padding. The sticker keeps its
 * 44 pt touch-target floor.
 */
export function captionMinimumBarHeight(variant: MediaTextVariant, fontSize: number): number {
  if (variant === 'bar') {
    return (
      MEDIA_TEXT_CAPTION_BAR_FONT_SIZE * MEDIA_TEXT_CAPTION_BAR_LINE_HEIGHT_FACTOR +
      MEDIA_TEXT_CAPTION_BAR_PADDING_V * 2
    );
  }
  return Math.max(44, fontSize + 20);
}
