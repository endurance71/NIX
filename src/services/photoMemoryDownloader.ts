import { randomUUID } from 'expo-crypto';
import NativeBackgroundUploader from '../../modules/nix-background-uploader/src';
import type { AccountTransport } from '../lib/supabase';

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export async function downloadPhotoToMemory(url: string, transport: AccountTransport) {
  transport.assertActive();
  if (!NativeBackgroundUploader?.downloadPhotoToMemory) {
    // Never fall back to RN fetch/ExpoImage, whose native URLCache can write plaintext.
    throw new Error('Secure photo downloader requires an updated native build');
  }
  const downloader = NativeBackgroundUploader;
  const requestId = randomUUID();
  const cancel = () => { void downloader.cancelPhotoDownload(requestId).catch(() => {}); };
  transport.signal.addEventListener('abort', cancel, { once: true });
  try {
    transport.assertActive();
    const photo = await downloader.downloadPhotoToMemory(requestId, url, transport.token, MAX_PHOTO_BYTES);
    transport.assertActive();
    if (!photo.base64 || photo.base64.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 || !/^image\/(jpeg|png|webp|heic|heif)$/.test(photo.contentType)) {
      throw new Error('Invalid photo download');
    }
    return photo;
  } finally {
    transport.signal.removeEventListener('abort', cancel);
  }
}
