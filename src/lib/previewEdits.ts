import {
  normalizeMediaTextOverlay,
  type MediaTextOverlay,
} from '../types/mediaTextOverlay';
import {
  normalizeMediaDrawingOverlay,
  type MediaDrawingOverlay,
} from '../types/mediaDrawingOverlay';

/** True when closing the preview would throw away text or a drawing the user added. */
export function hasPreviewEdits(
  textOverlay: MediaTextOverlay | null | undefined,
  drawingOverlay: MediaDrawingOverlay | null | undefined,
): boolean {
  return (
    normalizeMediaTextOverlay(textOverlay) !== null ||
    normalizeMediaDrawingOverlay(drawingOverlay) !== null
  );
}

/** A dragged text sticker is dropped on the trash zone when its centre is below the zone's top. */
export function isStickerOverTrashZone({
  stickerTopPx,
  stickerHeightPx,
  trashZoneTopPx,
}: {
  stickerTopPx: number;
  stickerHeightPx: number;
  trashZoneTopPx: number;
}): boolean {
  'worklet';
  return stickerTopPx + stickerHeightPx / 2 >= trashZoneTopPx;
}
