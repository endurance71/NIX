import { createContext, useState, use, type ReactNode } from 'react';

export type VideoSegmentDraft = {
  uri: string;
  durationMs: number;
};

type VideoDraftContextValue = {
  segments: VideoSegmentDraft[] | null;
  setSegments: (segments: VideoSegmentDraft[]) => void;
  clearSegments: () => void;
};

const VideoDraftContext = createContext<VideoDraftContextValue | null>(null);

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

export function useVideoDraft(): VideoDraftContextValue {
  const ctx = use(VideoDraftContext);
  if (!ctx) {
    throw new Error('useVideoDraft musi być użyty wewnątrz VideoDraftProvider');
  }
  return ctx;
}
