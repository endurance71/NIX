import { AppState } from 'react-native';
import { Image } from 'expo-image';
import { trackEvent } from './telemetry';

const IMAGE_DISK_CACHE_LIMIT_BYTES = 500 * 1024 * 1024;
const IMAGE_MEMORY_CACHE_LIMIT_BYTES = 120 * 1024 * 1024;

let configured = false;

export function configureMediaCache() {
  if (configured) return () => {};
  configured = true;

  try {
    Image.configureCache({
      maxDiskSize: IMAGE_DISK_CACHE_LIMIT_BYTES,
      maxMemoryCost: IMAGE_MEMORY_CACHE_LIMIT_BYTES,
      maxMemoryCount: 80,
    });
  } catch (error) {
    trackEvent('media_cache_config_failed', {
      error_message: error instanceof Error ? error.message : 'Unknown cache config error',
    });
  }

  const memoryWarningSub = (AppState as unknown as {
    addEventListener?: (type: 'memoryWarning', listener: () => void) => { remove: () => void };
  }).addEventListener?.('memoryWarning', () => {
    void Image.clearMemoryCache();
    trackEvent('media_cache_memory_warning');
  });

  return () => {
    memoryWarningSub?.remove();
  };
}

export async function clearMediaMemoryCache() {
  try {
    await Image.clearMemoryCache();
  } catch {
    // Cache cleanup is best effort.
  }
}
