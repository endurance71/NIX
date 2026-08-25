import { createContext, use } from 'react';
import type { MediaTextOverlay } from '../types/mediaTextOverlay';
import type { MediaDrawingOverlay } from '../types/mediaDrawingOverlay';
import type { CameraOrientation } from 'expo-camera';

export type VideoSegmentDraft = {
  uri: string;
  durationMs: number;
  width?: number;
  height?: number;
  captureOrientation?: CameraOrientation;
};

export type VideoDraftContextValue = {
  segments: VideoSegmentDraft[] | null;
  textOverlay: MediaTextOverlay | null;
  drawingOverlay: MediaDrawingOverlay | null;
  setSegments: (segments: VideoSegmentDraft[]) => void;
  updateSegmentDimensions: (index: number, width: number, height: number) => void;
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
