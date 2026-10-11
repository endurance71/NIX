import {
  DEFAULT_MEDIA_FILTER_ID,
  normalizeMediaFilterId,
  type MediaFilterId,
} from '../lib/mediaFilters';
import { normalizeMediaEmojiStickers, type MediaEmojiSticker } from './mediaStickerOverlay';

/**
 * Everything the preview editor composites below the text caption: the PencilKit drawing,
 * emoji stickers and the colour filter. Kept in one object so drafts and the send/save
 * pipelines carry the new layers without signature changes.
 */
export type MediaDrawingOverlay = {
  /** Base64-encoded PKDrawing.dataRepresentation(); empty when there is no drawing. */
  data: string;
  /** Canvas size used when the drawing was committed (0 when there is no drawing). */
  width: number;
  height: number;
  /** Colour filter; omitted for the original. */
  filter?: MediaFilterId;
  /** Emoji stickers, bottom to top. */
  stickers?: MediaEmojiSticker[];
};

export type MediaDrawingOverlayInput = Partial<MediaDrawingOverlay> | null | undefined;

function hasDrawing(overlay: Partial<MediaDrawingOverlay>): boolean {
  return (
    typeof overlay.data === 'string' &&
    overlay.data.trim().length > 0 &&
    Number.isFinite(overlay.width) &&
    Number.isFinite(overlay.height) &&
    (overlay.width ?? 0) > 0 &&
    (overlay.height ?? 0) > 0
  );
}

export function normalizeMediaDrawingOverlay(
  overlay: MediaDrawingOverlayInput
): MediaDrawingOverlay | null {
  if (!overlay) return null;
  const drawing = hasDrawing(overlay);
  const filter = normalizeMediaFilterId(overlay.filter);
  const stickers = normalizeMediaEmojiStickers(overlay.stickers);
  if (!drawing && filter === DEFAULT_MEDIA_FILTER_ID && stickers.length === 0) return null;
  return {
    data: drawing ? overlay.data!.trim() : '',
    width: drawing ? overlay.width! : 0,
    height: drawing ? overlay.height! : 0,
    ...(filter !== DEFAULT_MEDIA_FILTER_ID ? { filter } : {}),
    ...(stickers.length > 0 ? { stickers } : {}),
  };
}

/** True when the overlay carries PencilKit strokes (not just a filter or stickers). */
export function hasMediaDrawingStrokes(overlay: MediaDrawingOverlayInput): boolean {
  return Boolean(overlay) && hasDrawing(overlay!);
}

/** Replaces only the PencilKit part, keeping the filter and stickers. */
export function withDrawingStrokes(
  overlay: MediaDrawingOverlayInput,
  strokes: Pick<MediaDrawingOverlay, 'data' | 'width' | 'height'> | null | undefined,
): MediaDrawingOverlay | null {
  return normalizeMediaDrawingOverlay({
    ...(overlay ?? {}),
    data: strokes?.data ?? '',
    width: strokes?.width ?? 0,
    height: strokes?.height ?? 0,
  });
}

export function withDrawingFilter(
  overlay: MediaDrawingOverlayInput,
  filter: MediaFilterId,
): MediaDrawingOverlay | null {
  return normalizeMediaDrawingOverlay({ data: '', width: 0, height: 0, ...(overlay ?? {}), filter });
}

export function withDrawingStickers(
  overlay: MediaDrawingOverlayInput,
  stickers: MediaEmojiSticker[],
): MediaDrawingOverlay | null {
  return normalizeMediaDrawingOverlay({ data: '', width: 0, height: 0, ...(overlay ?? {}), stickers });
}
