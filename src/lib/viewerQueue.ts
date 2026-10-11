type SenderQueueItemLike = {
  id: string;
  media_path: string;
  view_duration_sec: number | null;
  media_type: string | null;
  playback_duration_ms: number | null;
  thumbnail_b64?: string | null;
  created_at?: string | null;
};

export type ViewerQueueItem = {
  id: string;
  media_path: string;
  view_duration_sec: number;
  media_type: string;
  playback_duration_ms: number | null;
  thumbnail_b64: string | null;
  /** Send time for the sender header; the route seed does not carry it. */
  created_at?: string | null;
};

export function toViewerQueueItem(item: SenderQueueItemLike): ViewerQueueItem {
  return {
    id: item.id,
    media_path: item.media_path,
    view_duration_sec: item.view_duration_sec ?? 5,
    media_type: item.media_type ?? 'image',
    playback_duration_ms: typeof item.playback_duration_ms === 'number' ? item.playback_duration_ms : null,
    thumbnail_b64: typeof item.thumbnail_b64 === 'string' ? item.thumbnail_b64 : null,
    created_at: typeof item.created_at === 'string' ? item.created_at : null,
  };
}

/**
 * The queue starts with the NiX the user tapped (e.g. the third unread in a chat), then the rest
 * of the sender's unread NiX-es in their original (oldest first) order.
 */
export function orderViewerQueueFromSeed<T extends { id: string }>(
  queue: readonly T[],
  seedId: string | null | undefined,
): T[] {
  if (!seedId) return [...queue];
  const seedIndex = queue.findIndex((item) => item.id === seedId);
  if (seedIndex <= 0) return [...queue];
  const seed = queue[seedIndex];
  return [seed, ...queue.slice(0, seedIndex), ...queue.slice(seedIndex + 1)];
}


type ViewerMediaIdentity = Pick<ViewerQueueItem, 'id' | 'media_path'>;

/**
 * The seed from route params and the fetched queue item are different objects for the same media.
 * Media loading is keyed by identity, so swapping one for the other never restarts a load.
 */
export function isSameViewerMedia(
  a: ViewerMediaIdentity | null | undefined,
  b: ViewerMediaIdentity | null | undefined,
): boolean {
  return Boolean(a && b && a.id === b.id && a.media_path === b.media_path);
}

/** Embedded `thumbnail_b64` as an image URI (videos only). */
export function viewerVideoPosterUri(
  item: Pick<ViewerQueueItem, 'media_type' | 'thumbnail_b64'> | null | undefined,
): string | null {
  if (item?.media_type !== 'video' || !item.thumbnail_b64) return null;
  return item.thumbnail_b64.startsWith('data:')
    ? item.thumbnail_b64
    : `data:image/jpeg;base64,${item.thumbnail_b64}`;
}

/**
 * Poster for the rendered video. The route seed usually lacks `thumbnail_b64` (the inbox does not
 * fetch it), so the fetched queue copy of the same nix is preferred once it arrives.
 */
export function selectViewerVideoPoster(
  rendered: ViewerQueueItem | null,
  current: ViewerQueueItem | null,
): string | null {
  if (!rendered) return viewerVideoPosterUri(current);
  return (
    viewerVideoPosterUri(rendered) ??
    (rendered.id === current?.id ? viewerVideoPosterUri(current) : null)
  );
}
