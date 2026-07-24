import { useState, type ReactNode } from 'react';
import { PhotoDraftContext } from './photoDraft';

export function PhotoDraftProvider({ children }: { children: ReactNode }) {
  const [uri, setUriState] = useState<string | null>(null);

  const setUri = (next: string) => {
    setUriState(next);
  };

  const clearUri = () => {
    setUriState(null);
  };

  const value = { uri, setUri, clearUri };

  return <PhotoDraftContext.Provider value={value}>{children}</PhotoDraftContext.Provider>;
}
