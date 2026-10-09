import { describe, expect, it } from 'vitest';
import { assertPreparedMediaSize, MAX_PREPARED_IMAGE_BYTES, MAX_PREPARED_VIDEO_BYTES } from './uploadMediaLimits';
import { isPermanentUploadError } from './durableUploadPolicy';

describe('actual prepared upload bytes', () => {
  it('accepts the exact 4 MiB photo boundary and permanently rejects one byte more', () => {
    expect(() => assertPreparedMediaSize('image', MAX_PREPARED_IMAGE_BYTES)).not.toThrow();
    try { assertPreparedMediaSize('image', MAX_PREPARED_IMAGE_BYTES + 1); }
    catch (error) {
      expect(error).toMatchObject({ code: 'FILE_TOO_LARGE_PERMANENT' });
      expect(isPermanentUploadError(error)).toBe(true);
      return;
    }
    throw new Error('Oversized photo unexpectedly accepted');
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid actual byte size %s before begin', (size) => {
    expect(() => assertPreparedMediaSize('image', size)).toThrow();
  });
  it('uses the video budget independently from the photo budget', () => {
    expect(() => assertPreparedMediaSize('video', MAX_PREPARED_VIDEO_BYTES)).not.toThrow();
    expect(() => assertPreparedMediaSize('video', MAX_PREPARED_VIDEO_BYTES + 1)).toThrow();
  });
  it.each(['INVALID_SIZE', 'MEDIA_TOO_LARGE', 'OBJECT_SIZE_MISMATCH'])('does not retry terminal server size error %s', (code) => {
    expect(isPermanentUploadError({ code })).toBe(true);
  });
});
