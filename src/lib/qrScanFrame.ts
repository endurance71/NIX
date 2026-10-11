export type ScanPoint = { x: number; y: number };
export type ScanRect = { x: number; y: number; width: number; height: number };

/**
 * Bounding box of a detected code (from `cornerPoints`, else `bounds`), grown by `padding` and
 * kept inside the view. `null` when the scanner gave nothing usable.
 */
export function scannedCodeFrame({
  cornerPoints,
  bounds,
  viewWidth,
  viewHeight,
  padding = 12,
}: {
  cornerPoints?: readonly ScanPoint[] | null;
  bounds?: { origin: ScanPoint; size: { width: number; height: number } } | null;
  viewWidth: number;
  viewHeight: number;
  padding?: number;
}): ScanRect | null {
  const points =
    cornerPoints && cornerPoints.length >= 2
      ? cornerPoints
      : bounds && bounds.size.width > 0 && bounds.size.height > 0
        ? [
            bounds.origin,
            { x: bounds.origin.x + bounds.size.width, y: bounds.origin.y + bounds.size.height },
          ]
        : null;
  if (!points || viewWidth <= 0 || viewHeight <= 0) return null;
  const xs = points.map((point) => point.x).filter(Number.isFinite);
  const ys = points.map((point) => point.y).filter(Number.isFinite);
  if (xs.length < 2 || ys.length < 2) return null;
  const left = Math.max(0, Math.min(...xs) - padding);
  const top = Math.max(0, Math.min(...ys) - padding);
  const right = Math.min(viewWidth, Math.max(...xs) + padding);
  const bottom = Math.min(viewHeight, Math.max(...ys) + padding);
  if (right - left < 8 || bottom - top < 8) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Centered square viewfinder that leaves room for the header and the bottom controls. */
export function viewfinderRect(viewWidth: number, viewHeight: number): ScanRect {
  const side = Math.max(160, Math.min(viewWidth - 96, viewHeight * 0.42, 300));
  return {
    x: (viewWidth - side) / 2,
    y: Math.max(0, (viewHeight - side) / 2 - 24),
    width: side,
    height: side,
  };
}
