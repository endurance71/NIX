import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { PhotoDraftContext, type PhotoDraftData } from './photoDraft';
import { cleanupOwnedTemporaryUris, ownedUrisToCleanup } from '../lib/ownedTemporaryFiles';

function scheduleOwnedCleanup(uris: readonly string[]) {
  if (uris.length === 0) return;
  void cleanupOwnedTemporaryUris(uris, {
    cacheDirectory: FileSystem.cacheDirectory ?? null,
    deleteAsync: (uri) => FileSystem.deleteAsync(uri, { idempotent: true }),
  });
}

export function PhotoDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraftState] = useState<PhotoDraftData | null>(null);
  const draftRef = useRef<PhotoDraftData | null>(null);

  const setDraft = useCallback((next: PhotoDraftData) => {
    const stale = ownedUrisToCleanup(
      draftRef.current?.ownedTemporaryUris,
      next.ownedTemporaryUris
    );
    draftRef.current = next;
    setDraftState(next);
    scheduleOwnedCleanup(stale);
  }, []);

  const clearDraft = useCallback(() => {
    const stale = draftRef.current?.ownedTemporaryUris ?? [];
    draftRef.current = null;
    setDraftState(null);
    scheduleOwnedCleanup(stale);
  }, []);

  const value = useMemo(() => ({ draft, setDraft, clearDraft }), [clearDraft, draft, setDraft]);

  return <PhotoDraftContext.Provider value={value}>{children}</PhotoDraftContext.Provider>;
}
