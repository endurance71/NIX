import * as FileSystem from 'expo-file-system/legacy';

import NativeBackgroundUploader from '../../modules/nix-background-uploader/src';

function sanitize(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, '_');
}

function extensionFromUri(uri: string, mediaType: 'image' | 'video') {
  const withoutQuery = uri.split('?')[0];
  const candidate = withoutQuery.split('.').pop()?.toLowerCase();
  if (candidate && /^[a-z0-9]{1,8}$/.test(candidate)) return candidate;
  return mediaType === 'video' ? 'mp4' : 'jpg';
}

function fallbackJobDirectory(jobId: string) {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('Trwały katalog aplikacji jest niedostępny.');
  return `${root}NiX/Uploads/${sanitize(jobId)}/`;
}

export async function stageUploadFile({
  jobId,
  sourceUri,
  mediaType,
  role = 'source',
}: {
  jobId: string;
  sourceUri: string;
  mediaType: 'image' | 'video';
  role?: 'source' | 'prepared';
}) {
  const extension = extensionFromUri(sourceUri, mediaType);
  const fileName = `${role}.${extension}`;
  if (NativeBackgroundUploader) {
    const staged = await NativeBackgroundUploader.stageFile(jobId, sourceUri, fileName);
    return { ...staged, extension };
  }

  const directory = fallbackJobDirectory(jobId);
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}${fileName}`;
  if (sourceUri !== destination) {
    await FileSystem.deleteAsync(destination, { idempotent: true });
    await FileSystem.copyAsync({ from: sourceUri, to: destination });
  }
  const info = await FileSystem.getInfoAsync(destination);
  if (!info.exists) throw new Error('Nie udało się zabezpieczyć pliku do wysyłki.');
  return {
    uri: destination,
    sizeBytes: typeof info.size === 'number' ? info.size : 0,
    extension,
  };
}

export async function deleteStagedUploadJob(jobId: string) {
  if (NativeBackgroundUploader) {
    await NativeBackgroundUploader.deleteStagedJob(jobId);
    return;
  }
  await FileSystem.deleteAsync(fallbackJobDirectory(jobId), { idempotent: true });
}

export async function findStagedUploadFile(
  jobId: string,
  role: 'source' | 'prepared',
  mediaType: 'image' | 'video'
) {
  if (NativeBackgroundUploader) {
    const staged = await NativeBackgroundUploader.findStagedFile(jobId, role);
    return staged
      ? { ...staged, extension: extensionFromUri(staged.uri, mediaType) }
      : null;
  }
  const directory = fallbackJobDirectory(jobId);
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists || !info.isDirectory) return null;
  const names = await FileSystem.readDirectoryAsync(directory);
  const name = names.find((candidate) => candidate.startsWith(`${role}.`));
  if (!name) return null;
  const uri = `${directory}${name}`;
  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (!fileInfo.exists || fileInfo.isDirectory) return null;
  return {
    uri,
    sizeBytes: typeof fileInfo.size === 'number' ? fileInfo.size : 0,
    extension: extensionFromUri(uri, mediaType),
  };
}

export async function stagedUploadFileExists(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && !info.isDirectory && (typeof info.size !== 'number' || info.size > 0);
}

export function inferUploadContentType(uri: string, mediaType: 'image' | 'video') {
  const extension = extensionFromUri(uri, mediaType);
  if (mediaType === 'image') {
    if (extension === 'png') return { extension, contentType: 'image/png' };
    if (extension === 'webp') return { extension, contentType: 'image/webp' };
    return { extension: extension === 'jpeg' ? 'jpg' : extension, contentType: 'image/jpeg' };
  }
  if (extension === 'mov') return { extension, contentType: 'video/quicktime' };
  if (extension === 'm4v') return { extension, contentType: 'video/x-m4v' };
  return { extension, contentType: 'video/mp4' };
}
