import { useState, type ReactNode } from 'react';
import type { MediaTextOverlay } from '../types/mediaTextOverlay';
import { VideoDraftContext, type VideoSegmentDraft } from './videoDraft';

export function VideoDraftProvider({ children }: { children: ReactNode }) {
  const [segments, setSegmentsState] = useState<VideoSegmentDraft[] | null>(null);
  const [textOverlay, setTextOverlayState] = useState<MediaTextOverlay | null>(null);

  const setSegments = (next: VideoSegmentDraft[]) => {
    setSegmentsState(next);
    setTextOverlayState(null);
  };

  const setTextOverlay = (next: MediaTextOverlay | null) => {
    setTextOverlayState(next);
  };

  const clearSegments = () => {
    setSegmentsState(null);
    setTextOverlayState(null);
  };

  const value = { segments, textOverlay, setSegments, setTextOverlay, clearSegments };

  return <VideoDraftContext.Provider value={value}>{children}</VideoDraftContext.Provider>;
}
