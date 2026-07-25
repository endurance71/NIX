import { createContext, use } from 'react';

export type PhotoDraftData = {
  uri: string;
  width?: number;
  height?: number;
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
