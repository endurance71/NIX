import { createVideoPlayer } from 'expo-video';
import type { VideoThumbnail } from 'expo-video';

/**
 * In-memory cache dla wyników generowania miniatur.
 * Klucz: `${sourceUri}:${timeSec}` → Promise<VideoThumbnail | null>.
 * Wpisy są automatycznie evictowane po 60 s aby nie trzymać pamięci.
 */
const thumbnailCache = new Map<string, Promise<VideoThumbnail | null>>();

/** Maksymalna liczba wpisów w cache — zabezpieczenie przed wyciekiem pamięci. */
const THUMBNAIL_CACHE_MAX_ENTRIES = 24;
const THUMBNAIL_CACHE_EVICTION_MS = 60_000;

function buildCacheKey(sourceUri: string, timeSec: number): string {
  return `${sourceUri}:${timeSec}`;
}

function evictOldestIfNeeded() {
  if (thumbnailCache.size <= THUMBNAIL_CACHE_MAX_ENTRIES) return;
  // Map zachowuje kolejność wstawiania — usuwamy najstarszy wpis.
  const firstKey = thumbnailCache.keys().next().value;
  if (firstKey != null) thumbnailCache.delete(firstKey);
}

/**
 * Generuje miniaturę klatki wideo przez expo-video (zastępuje deprecated expo-video-thumbnails).
 * Wymaga załadowanego źródła w odtwarzaczu — używa replaceAsync + generateThumbnailsAsync.
 *
 * Wyniki są cache'owane w pamięci per (uri, timeSec) i automatycznie
 * usuwane po 60 s, dzięki czemu wielokrotne wywołania dla tego samego klipu
 * (preview → upload → viewer) nie alokują nowego VideoPlayer za każdym razem.
 */
export function generateVideoThumbnailAtTime(
  sourceUri: string,
  timeSec = 0,
  options?: { maxWidth?: number }
): Promise<VideoThumbnail | null> {
  const maxWidth = options?.maxWidth ?? 1280;
  const cacheKey = buildCacheKey(sourceUri, timeSec);

  const cached = thumbnailCache.get(cacheKey);
  if (cached) return cached;

  evictOldestIfNeeded();

  const promise = generateVideoThumbnailUncached(sourceUri, timeSec, maxWidth);
  thumbnailCache.set(cacheKey, promise);

  // Auto-evict po zakończeniu — niezależnie od sukcesu/błędu.
  void promise.finally(() => {
    setTimeout(() => thumbnailCache.delete(cacheKey), THUMBNAIL_CACHE_EVICTION_MS);
  });

  return promise;
}

async function generateVideoThumbnailUncached(
  sourceUri: string,
  timeSec: number,
  maxWidth: number
): Promise<VideoThumbnail | null> {
  const player = createVideoPlayer(sourceUri);
  try {
    await player.replaceAsync({ uri: sourceUri });
    const thumbs = await player.generateThumbnailsAsync([timeSec], { maxWidth });
    return thumbs[0] ?? null;
  } finally {
    player.release();
  }
}

/**
 * Czyści cały cache miniatur — przydatne przy zwalnianiu pamięci (np. viewer cleanup).
 */
export function clearThumbnailCache() {
  thumbnailCache.clear();
}
