import { createContext, use } from 'react';

export type VideoSegmentDraft = {
  uri: string;
  durationMs: number;
};

export type VideoDraftContextValue = {
  segments: VideoSegmentDraft[] | null;
  setSegments: (segments: VideoSegmentDraft[]) => void;
  clearSegments: () => void;
};

export const VideoDraftContext = createContext<VideoDraftContextValue | null>(null);

export function useVideoDraft(): VideoDraftContextValue {
  const context = use(VideoDraftContext);
  if (!context) {
    throw new Error('useVideoDraft musi być użyty wewnątrz VideoDraftProvider');
  }
  return context;
}
