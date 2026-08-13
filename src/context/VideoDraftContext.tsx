import { useState, type ReactNode } from 'react';
import type { MediaTextOverlay } from '../types/mediaTextOverlay';
import type { MediaDrawingOverlay } from '../types/mediaDrawingOverlay';
import { VideoDraftContext, type VideoSegmentDraft } from './videoDraft';

export function VideoDraftProvider({ children }: { children: ReactNode }) {
  const [segments, setSegmentsState] = useState<VideoSegmentDraft[] | null>(null);
  const [textOverlay, setTextOverlayState] = useState<MediaTextOverlay | null>(null);
  const [drawingOverlay, setDrawingOverlayState] = useState<MediaDrawingOverlay | null>(null);

  const setSegments = (next: VideoSegmentDraft[]) => {
    setSegmentsState(next);
    setTextOverlayState(null);
    setDrawingOverlayState(null);
  };

  const setTextOverlay = (next: MediaTextOverlay | null) => {
    setTextOverlayState(next);
  };

  const setDrawingOverlay = (next: MediaDrawingOverlay | null) => {
    setDrawingOverlayState(next);
  };

  const clearSegments = () => {
    setSegmentsState(null);
    setTextOverlayState(null);
    setDrawingOverlayState(null);
  };

  const value = {
    segments,
    textOverlay,
    drawingOverlay,
    setSegments,
    setTextOverlay,
    setDrawingOverlay,
    clearSegments,
  };

  return <VideoDraftContext.Provider value={value}>{children}</VideoDraftContext.Provider>;
}
