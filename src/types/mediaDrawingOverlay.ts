export type MediaDrawingOverlay = {
  /** Base64-encoded PKDrawing.dataRepresentation(). */
  data: string;
  /** Canvas size used when the drawing was committed. */
  width: number;
  height: number;
};

export type MediaDrawingOverlayInput = Partial<MediaDrawingOverlay> | null | undefined;

export function normalizeMediaDrawingOverlay(
  overlay: MediaDrawingOverlayInput
): MediaDrawingOverlay | null {
  if (!overlay || typeof overlay.data !== 'string') return null;
  const data = overlay.data.trim();
  if (!data) return null;
  if (!Number.isFinite(overlay.width) || !Number.isFinite(overlay.height)) return null;
  if ((overlay.width ?? 0) <= 0 || (overlay.height ?? 0) <= 0) return null;
  return {
    data,
    width: overlay.width!,
    height: overlay.height!,
  };
}
