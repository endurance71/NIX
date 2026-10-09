export const MAX_PREPARED_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_PREPARED_VIDEO_BYTES = 100 * 1024 * 1024;

export function assertPreparedMediaSize(mediaType: 'image' | 'video', actualBytes: number) {
  const max = mediaType === 'image' ? MAX_PREPARED_IMAGE_BYTES : MAX_PREPARED_VIDEO_BYTES;
  if (!Number.isSafeInteger(actualBytes) || actualBytes <= 0 || actualBytes > max) {
    const error = new Error('Prepared media does not meet the upload size limit.') as Error & { code: string };
    error.code = actualBytes > max ? 'FILE_TOO_LARGE_PERMANENT' : 'INVALID_MEDIA';
    throw error;
  }
}
