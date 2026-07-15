import { useState, type ReactNode } from 'react';
import { VideoDraftContext, type VideoSegmentDraft } from './videoDraft';

export function VideoDraftProvider({ children }: { children: ReactNode }) {
  const [segments, setSegmentsState] = useState<VideoSegmentDraft[] | null>(null);

  const setSegments = (next: VideoSegmentDraft[]) => {
    setSegmentsState(next);
  };

  const clearSegments = () => {
    setSegmentsState(null);
  };

  const value = { segments, setSegments, clearSegments };

  return <VideoDraftContext.Provider value={value}>{children}</VideoDraftContext.Provider>;
}
