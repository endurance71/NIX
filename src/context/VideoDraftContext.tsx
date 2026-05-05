import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

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

  const setSegments = useCallback((next: VideoSegmentDraft[]) => {
    setSegmentsState(next);
  }, []);

  const clearSegments = useCallback(() => {
    setSegmentsState(null);
  }, []);

  const value = useMemo(
    () => ({ segments, setSegments, clearSegments }),
    [segments, setSegments, clearSegments]
  );

  return <VideoDraftContext.Provider value={value}>{children}</VideoDraftContext.Provider>;
}

export function useVideoDraft(): VideoDraftContextValue {
  const ctx = useContext(VideoDraftContext);
  if (!ctx) {
    throw new Error('useVideoDraft musi być użyty wewnątrz VideoDraftProvider');
  }
  return ctx;
}
