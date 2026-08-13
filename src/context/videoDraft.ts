import { createContext, use } from 'react';
import type { MediaTextOverlay } from '../types/mediaTextOverlay';
import type { MediaDrawingOverlay } from '../types/mediaDrawingOverlay';

export type VideoSegmentDraft = {
  uri: string;
  durationMs: number;
};

export type VideoDraftContextValue = {
  segments: VideoSegmentDraft[] | null;
  textOverlay: MediaTextOverlay | null;
  drawingOverlay: MediaDrawingOverlay | null;
  setSegments: (segments: VideoSegmentDraft[]) => void;
  setTextOverlay: (overlay: MediaTextOverlay | null) => void;
  setDrawingOverlay: (overlay: MediaDrawingOverlay | null) => void;
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
