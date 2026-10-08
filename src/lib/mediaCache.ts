import { AppState } from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { encryptedPhotoCache } from './encryptedPhotoCache';
import { trackEvent } from './telemetry';

const IMAGE_DISK_CACHE_LIMIT_BYTES = 500 * 1024 * 1024;
const IMAGE_MEMORY_CACHE_LIMIT_BYTES = 120 * 1024 * 1024;

let configured = false;
let preparation: Promise<void> | undefined;
const LEGACY_PHOTO_PURGE_KEY = 'nix.photo-cache.legacy-purged.v1';

/** Complete migration before allowing any private photo to be displayed. */
export function preparePrivatePhotoCache() {
  preparation ??= (async () => {
    if (await AsyncStorage.getItem(LEGACY_PHOTO_PURGE_KEY) !== 'done') {
      if (await Image.clearDiskCache() === false) throw new Error('Legacy photo cache purge failed');
      await Image.clearMemoryCache();
      await AsyncStorage.setItem(LEGACY_PHOTO_PURGE_KEY, 'done');
    }
    await encryptedPhotoCache.sweep();
  })().catch((error) => { preparation = undefined; throw error; });
  return preparation;
}

export function configureMediaCache() {
  if (configured) return () => {};
  configured = true;
  const sweep = () => { void preparePrivatePhotoCache().then(() => encryptedPhotoCache.sweep()).catch(() => {}); };
  sweep();
  const foregroundSub = AppState.addEventListener('change', (state) => { if (state === 'active') sweep(); });
  const expiryTimer = setInterval(sweep, 15_000);

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
    foregroundSub.remove();
    clearInterval(expiryTimer);
    configured = false;
  };
}

export async function clearMediaMemoryCache() {
  try {
    await Image.clearMemoryCache();
  } catch {
    // Cache cleanup is best effort.
  }
}
