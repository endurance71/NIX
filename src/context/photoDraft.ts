import { createContext, use } from 'react';
import type { MediaTextOverlay } from '../types/mediaTextOverlay';
import type { MediaDrawingOverlay } from '../types/mediaDrawingOverlay';
import type { CameraOrientation } from 'expo-camera';

export type PhotoDraftData = {
  uri: string;
  width?: number;
  height?: number;
  captureOrientation?: CameraOrientation;
  textOverlay?: MediaTextOverlay | null;
  drawingOverlay?: MediaDrawingOverlay | null;
  /**
   * Temporary files created by clipboard import. Camera and gallery URIs must
   * not be listed here — only these paths are eligible for best-effort delete.
   */
  ownedTemporaryUris?: string[];
};

export type PhotoDraftContextValue = {
  draft: PhotoDraftData | null;
  setDraft: (draft: PhotoDraftData) => void;
  clearDraft: () => void;
};

export const PhotoDraftContext = createContext<PhotoDraftContextValue | null>(null);

export function usePhotoDraft(): PhotoDraftContextValue {
  const context = use(PhotoDraftContext);
  if (!context) {
    throw new Error('usePhotoDraft musi być użyty wewnątrz PhotoDraftProvider');
  }
  return context;
}
