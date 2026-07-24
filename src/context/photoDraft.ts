import { createContext, use } from 'react';

export type PhotoDraftContextValue = {
  uri: string | null;
  setUri: (uri: string) => void;
  clearUri: () => void;
};

export const PhotoDraftContext = createContext<PhotoDraftContextValue | null>(null);

export function usePhotoDraft(): PhotoDraftContextValue {
  const context = use(PhotoDraftContext);
  if (!context) {
    throw new Error('usePhotoDraft musi być użyty wewnątrz PhotoDraftProvider');
  }
  return context;
}
