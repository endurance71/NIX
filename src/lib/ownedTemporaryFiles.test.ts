import { describe, expect, it } from 'vitest';
import {
  cleanupOwnedTemporaryUris,
  isOwnedPasteTempUri,
  ownedUrisToCleanup,
  pasteCacheDirectory,
} from './ownedTemporaryFiles';

const CACHE = 'file:///cache/';
const OWNED = 'file:///cache/nix-paste/paste-a.jpg';
const CAMERA = 'file:///cache/Camera/photo.jpg';
const GALLERY = 'file:///var/mobile/Media/DCIM/100APPLE/IMG_0001.JPG';
const TMP = 'file:///tmp/clipboard.gif';

describe('owned paste temporary files', () => {
  it('akceptuje wyłącznie pliki w katalogu nix-paste aplikacji', () => {
    expect(pasteCacheDirectory(CACHE)).toBe('file:///cache/nix-paste/');
    expect(isOwnedPasteTempUri(OWNED, CACHE)).toBe(true);
  });

  it('odrzuca plik aparatu, galerii, tmp i arbitralną ścieżkę', () => {
    expect(isOwnedPasteTempUri(CAMERA, CACHE)).toBe(false);
    expect(isOwnedPasteTempUri(GALLERY, CACHE)).toBe(false);
    expect(isOwnedPasteTempUri(TMP, CACHE)).toBe(false);
    expect(isOwnedPasteTempUri('file:///etc/passwd', CACHE)).toBe(false);
    expect(isOwnedPasteTempUri('file:///cache/nix-paste/../secret.jpg', CACHE)).toBe(false);
    expect(isOwnedPasteTempUri('file:///cache/nix-paste/%2e%2e/secret.jpg', CACHE)).toBe(false);
    expect(isOwnedPasteTempUri('https://example.invalid/x.jpg', CACHE)).toBe(false);
    expect(isOwnedPasteTempUri('ph://asset', CACHE)).toBe(false);
    expect(isOwnedPasteTempUri('file:///cache/nix-paste/nested/dir.jpg', CACHE)).toBe(false);
  });

  it('zastąpienie draftu zwraca tylko poprzednie owned, których nie ma w nowym', () => {
    expect(ownedUrisToCleanup([OWNED, 'file:///cache/nix-paste/old.png'], [OWNED])).toEqual([
      'file:///cache/nix-paste/old.png',
    ]);
    expect(ownedUrisToCleanup([OWNED], [OWNED])).toEqual([]);
    expect(ownedUrisToCleanup(undefined, [OWNED])).toEqual([]);
  });

  it('cleanup jest idempotentny i nie kasuje cudzych plików', async () => {
    const deleted: string[] = [];
    const deleteAsync = async (uri: string) => {
      deleted.push(uri);
    };

    await cleanupOwnedTemporaryUris([OWNED, CAMERA, GALLERY, OWNED], {
      cacheDirectory: CACHE,
      deleteAsync,
    });
    expect(deleted).toEqual([OWNED]);

    await cleanupOwnedTemporaryUris([OWNED], {
      cacheDirectory: CACHE,
      deleteAsync,
    });
    expect(deleted).toEqual([OWNED, OWNED]);

    await cleanupOwnedTemporaryUris([CAMERA], {
      cacheDirectory: CACHE,
      deleteAsync: async () => {
        throw new Error('missing');
      },
    });
  });
});
