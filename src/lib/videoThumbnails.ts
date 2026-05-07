import { createVideoPlayer } from 'expo-video';
import type { VideoThumbnail } from 'expo-video';

/**
 * Generuje miniaturę klatki wideo przez expo-video (zastępuje deprecated expo-video-thumbnails).
 * Wymaga załadowanego źródła w odtwarzaczu — używa replaceAsync + generateThumbnailsAsync.
 */
export async function generateVideoThumbnailAtTime(
  sourceUri: string,
  timeSec = 0,
  options?: { maxWidth?: number }
): Promise<VideoThumbnail | null> {
  const player = createVideoPlayer(sourceUri);
  try {
    await player.replaceAsync({ uri: sourceUri });
    const thumbs = await player.generateThumbnailsAsync([timeSec], {
      maxWidth: options?.maxWidth ?? 1280,
    });
    return thumbs[0] ?? null;
  } finally {
    player.release();
  }
}
