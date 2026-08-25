import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { MediaTextOverlay } from '../types/mediaTextOverlay';
import type { MediaDrawingOverlay } from '../types/mediaDrawingOverlay';
import { VideoDraftContext, type VideoSegmentDraft } from './videoDraft';

export function VideoDraftProvider({ children }: { children: ReactNode }) {
  const [segments, setSegmentsState] = useState<VideoSegmentDraft[] | null>(null);
  const [textOverlay, setTextOverlayState] = useState<MediaTextOverlay | null>(null);
  const [drawingOverlay, setDrawingOverlayState] = useState<MediaDrawingOverlay | null>(null);

  const setSegments = useCallback((next: VideoSegmentDraft[]) => {
    setSegmentsState(next);
    setTextOverlayState(null);
    setDrawingOverlayState(null);
  }, []);

  const setTextOverlay = useCallback((next: MediaTextOverlay | null) => {
    setTextOverlayState(next);
  }, []);

  const setDrawingOverlay = useCallback((next: MediaDrawingOverlay | null) => {
    setDrawingOverlayState(next);
  }, []);

  const updateSegmentDimensions = useCallback((index: number, width: number, height: number) => {
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return;
    setSegmentsState((current) => {
      if (!current?.[index]) return current;
      const segment = current[index];
      if (segment.width === width && segment.height === height) return current;
      return current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, width, height } : item
      );
    });
  }, []);

  const clearSegments = useCallback(() => {
    setSegmentsState(null);
    setTextOverlayState(null);
    setDrawingOverlayState(null);
  }, []);

  const value = useMemo(() => ({
    segments,
    textOverlay,
    drawingOverlay,
    setSegments,
    updateSegmentDimensions,
    setTextOverlay,
    setDrawingOverlay,
    clearSegments,
  }), [
    clearSegments,
    drawingOverlay,
    segments,
    setDrawingOverlay,
    setSegments,
    setTextOverlay,
    textOverlay,
    updateSegmentDimensions,
  ]);

  return <VideoDraftContext.Provider value={value}>{children}</VideoDraftContext.Provider>;
}
