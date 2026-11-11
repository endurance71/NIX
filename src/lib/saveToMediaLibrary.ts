import { Asset, getPermissionsAsync, requestPermissionsAsync } from 'expo-media-library';
import { requestPermissionRespectingRefusal } from './permissionRequest';
import * as FileSystem from 'expo-file-system/legacy';
import NativeBackgroundUploader from '../../modules/nix-background-uploader/src';

/** `denied`: just refused in the system prompt; `blocked`: refused before this attempt. */
export type MediaLibraryWritePermission = 'granted' | 'denied' | 'blocked';

const SAVE_CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}nix-save-to-library/`;

function normalizeLocalUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) {
    throw new Error('Brak lokalnego URI do zapisu.');
  }
  return trimmed;
}

function extensionFromHintOrUri(uri: string, extHint?: string): string {
  const hint = extHint?.replace(/^\./, '').trim().toLowerCase();
  if (hint) return hint;
  const path = uri.split('?')[0] ?? uri;
  const match = path.match(/\.([a-zA-Z0-9]{2,5})$/);
  return (match?.[1] ?? 'bin').toLowerCase();
}

export async function ensureWritePermission(): Promise<MediaLibraryWritePermission> {
  const outcome = await requestPermissionRespectingRefusal(
    () => getPermissionsAsync(true),
    () => requestPermissionsAsync(true)
  );
  return outcome === 'refused' ? 'denied' : outcome;
}

export async function saveLocalUrisToLibrary(uris: string[]): Promise<void> {
  const normalized = uris.map(normalizeLocalUri);
  if (normalized.length === 0) {
    throw new Error('Brak plików do zapisu.');
  }

  await Promise.all(normalized.map((uri) => Asset.create(uri)));
}

export async function saveRemoteUriToLibrary(remoteUri: string, extHint?: string): Promise<void> {
  const trimmed = remoteUri.trim();
  if (!trimmed) {
    throw new Error('Brak zdalnego URI do zapisu.');
  }
  const photo = /^data:(image\/(?:jpeg|png|webp|heic|heif));base64,([A-Za-z0-9+/=]+)$/.exec(trimmed);
  if (photo) {
    if (!NativeBackgroundUploader?.savePhotoToLibrary) throw new Error('Photo export requires an updated native build');
    await NativeBackgroundUploader.savePhotoToLibrary(photo[2], photo[1]);
    return;
  }

  if (trimmed.startsWith('file://') || trimmed.startsWith('/')) {
    await saveLocalUrisToLibrary([trimmed.startsWith('/') ? `file://${trimmed}` : trimmed]);
    return;
  }

  if (!FileSystem.cacheDirectory) {
    throw new Error('Brak katalogu cache do pobrania pliku.');
  }

  await FileSystem.makeDirectoryAsync(SAVE_CACHE_DIR, { intermediates: true });
  const ext = extensionFromHintOrUri(trimmed, extHint);
  const tempUri = `${SAVE_CACHE_DIR}save-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  try {
    const downloaded = await FileSystem.downloadAsync(trimmed, tempUri);
    if (!downloaded.uri) {
      throw new Error('Pobieranie pliku nie powiodło się.');
    }
    await Asset.create(downloaded.uri);
  } finally {
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => undefined);
  }
}
