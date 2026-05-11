type SenderQueueItemLike = {
  id: string;
  media_path: string;
  view_duration_sec: number | null;
  media_type: string | null;
  playback_duration_ms: number | null;
  thumbnail_b64?: string | null;
};

export type ViewerQueueItem = {
  id: string;
  media_path: string;
  view_duration_sec: number;
  media_type: string;
  playback_duration_ms: number | null;
  thumbnail_b64: string | null;
};

export function toViewerQueueItem(item: SenderQueueItemLike): ViewerQueueItem {
  return {
    id: item.id,
    media_path: item.media_path,
    view_duration_sec: item.view_duration_sec ?? 5,
    media_type: item.media_type ?? 'image',
    playback_duration_ms: typeof item.playback_duration_ms === 'number' ? item.playback_duration_ms : null,
    thumbnail_b64: typeof item.thumbnail_b64 === 'string' ? item.thumbnail_b64 : null,
  };
}

