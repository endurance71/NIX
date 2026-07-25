import { useState, type ReactNode } from 'react';
import { PhotoDraftContext, type PhotoDraftData } from './photoDraft';

export function PhotoDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraftState] = useState<PhotoDraftData | null>(null);

  const setDraft = (next: PhotoDraftData) => {
    setDraftState(next);
  };

  const clearDraft = () => {
    setDraftState(null);
  };

  const value = { draft, setDraft, clearDraft };

  return <PhotoDraftContext.Provider value={value}>{children}</PhotoDraftContext.Provider>;
}
