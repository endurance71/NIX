import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_VIDEO_FILE_SIZE_BYTES, uploadImageAndCreateNix, uploadVideoAndCreateNix, isFastPathEligible } from './mediaService';

const {
  mockUpload,
  mockGetCurrentUser,
  mockInsertNix,
  mockGetInfoAsync,
  mockUploadResumable,
} = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockGetCurrentUser: vi.fn(),
  mockInsertNix: vi.fn(),
  mockGetInfoAsync: vi.fn(),
  mockUploadResumable: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: mockUpload,
      }),
    },
  },
}));

vi.mock('expo-file-system/legacy', () => ({
  getInfoAsync: mockGetInfoAsync,
  deleteAsync: vi.fn().mockResolvedValue(undefined),
  readAsStringAsync: vi.fn().mockResolvedValue(''),
}));

vi.mock('react-native-compressor', () => ({
  Video: {
    compress: vi.fn().mockResolvedValue('file:///tmp/compressed.mp4'),
  },
}));

vi.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulateAsync: vi.fn().mockResolvedValue({ uri: 'file:///tmp/out.jpg' }),
  },
  SaveFormat: { JPEG: 'jpeg' },
}));

vi.mock('./profileService', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock('./nixService', () => ({
  insertNix: mockInsertNix,
}));

vi.mock('./resumableUploadService', () => ({
  uploadResumable: mockUploadResumable,
}));

describe('mediaService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Domyślny rozmiar pliku — 4 bajty (testowy stub).
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 4 });
  });

  it('wgrywa plik i tworzy rekord nixa', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockUploadResumable.mockResolvedValue(undefined);
    mockInsertNix.mockResolvedValue(undefined);

    const blob = new Blob(['test'], { type: 'image/jpeg' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: async () => blob,
        arrayBuffer: async () => blob.arrayBuffer(),
      })
    );

    await uploadImageAndCreateNix('file:///tmp/image.jpg', 'receiver-1');

    expect(mockUploadResumable).toHaveBeenCalledTimes(1);
    expect(mockUploadResumable).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'media-vault',
        contentType: 'image/jpeg',
      })
    );
    expect(mockInsertNix).toHaveBeenCalledWith(
      'receiver-1',
      expect.stringContaining('nixes/user-1/'),
      5,
      expect.objectContaining({ clientUploadId: expect.any(String) })
    );
  });

  it('przekazuje niestandardowy czas wyświetlania do rekordu nixa', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockUploadResumable.mockResolvedValue(undefined);
    mockInsertNix.mockResolvedValue(undefined);

    const blob = new Blob(['test'], { type: 'image/jpeg' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: async () => blob,
        arrayBuffer: async () => blob.arrayBuffer(),
      })
    );

    await uploadImageAndCreateNix('file:///tmp/image.jpg', 'receiver-1', 180);

    expect(mockInsertNix).toHaveBeenCalledWith(
      'receiver-1',
      expect.stringContaining('nixes/user-1/'),
      180,
      expect.objectContaining({ clientUploadId: expect.any(String) })
    );
  });

  it('rzuca błąd gdy brak zalogowanego użytkownika', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await expect(uploadImageAndCreateNix('file:///tmp/image.jpg', 'receiver-1')).rejects.toThrow(
      'Brak autoryzacji.'
    );
  });

  it('rzuca błąd gdy obraz jest pusty', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 0 });

    await expect(uploadImageAndCreateNix('file:///tmp/image.jpg', 'receiver-1')).rejects.toThrow(
      'Plik jest pusty lub uszkodzony.'
    );
  });

  it('wgrywa wideo strumieniowo (resumable) i tworzy rekord nixa', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 8 * 1024 * 1024 });
    mockInsertNix.mockResolvedValue(undefined);
    mockUploadResumable.mockResolvedValue(undefined);

    await uploadVideoAndCreateNix('file:///tmp/video.mp4', 'receiver-1', 12_000, 15);

    expect(mockUploadResumable).toHaveBeenCalledTimes(1);
    expect(mockUploadResumable).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'media-vault',
        contentType: 'video/mp4',
        fileSizeBytes: 8 * 1024 * 1024,
        upsert: false,
      })
    );
    // Klasyczny upload przez storage SDK nie powinien być wywołany dla wideo.
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockInsertNix).toHaveBeenCalledWith(
      'receiver-1',
      expect.stringMatching(/^nixes\/user-1\/.+\.mp4$/),
      15,
      expect.objectContaining({
        mediaType: 'video',
        playbackDurationMs: 12_000,
        thumbnailB64: null,
      })
    );
  });

  it('rzuca czytelny błąd, gdy plik wideo przekracza limit', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: MAX_VIDEO_FILE_SIZE_BYTES + 1 });

    const overLimitMb = ((MAX_VIDEO_FILE_SIZE_BYTES + 1) / (1024 * 1024)).toFixed(1);
    await expect(uploadVideoAndCreateNix('file:///tmp/video.mp4', 'receiver-1', 8_000)).rejects.toThrow(
      `Plik nadal jest za duży po kompresji (${overLimitMb} MB). Maksymalny rozmiar to ${Math.round(MAX_VIDEO_FILE_SIZE_BYTES / (1024 * 1024))} MB — wybierz krótsze wideo.`
    );
    expect(mockUploadResumable).not.toHaveBeenCalled();
  });

  it('rzuca czytelny błąd, gdy plik wideo jest pusty', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 0 });

    await expect(uploadVideoAndCreateNix('file:///tmp/video.mp4', 'receiver-1', 5_000)).rejects.toThrow(
      'Plik jest pusty lub uszkodzony.'
    );
    expect(mockUploadResumable).not.toHaveBeenCalled();
  });

  it('mapuje błąd serwera o przekroczeniu rozmiaru na komunikat domenowy', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 4 * 1024 * 1024 });
    mockUploadResumable.mockRejectedValue(
      new Error('The object exceeded the maximum allowed size')
    );

    await expect(uploadVideoAndCreateNix('file:///tmp/video.mp4', 'receiver-1', 5_000)).rejects.toThrow(
      `Plik wideo przekracza limit uploadu serwera. Utrzymaj plik poniżej ${Math.round(
        MAX_VIDEO_FILE_SIZE_BYTES / (1024 * 1024)
      )} MB.`
    );
  });
});

describe('isFastPathEligible', () => {
  const TARGET_VIDEO_BITRATE = 2_000_000;
  const VIDEO_FAST_PATH_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

  it('zwraca true dla plikow mniejszych niz limit MB (niezaleznie od bitrate)', () => {
    // 5 MB = 5 * 1024 * 1024
    expect(isFastPathEligible('file:///test.mp4', 5 * 1024 * 1024, 1000)).toBe(true);
  });

  it('zwraca true dla pliku powyzej 10 MB ale z niskim bitratem (< TARGET * 1.4)', () => {
    const size = 15 * 1024 * 1024; // 15 MB
    const duration = 60000; // 60s
    // 15 MB * 8 / 60s = 2 Mbps, ktory jest = TARGET_VIDEO_BITRATE
    expect(isFastPathEligible('file:///test.mp4', size, duration)).toBe(true);
  });

  it('zwraca false dla pliku powyzej 10 MB i z wysokim bitratem (> TARGET * 1.4)', () => {
    const size = 20 * 1024 * 1024; // 20 MB
    const duration = 10000; // 10s
    // 20 MB * 8 / 10s = 16 Mbps
    expect(isFastPathEligible('file:///test.mp4', size, duration)).toBe(false);
  });

  it('zwraca false, gdy uri nie jest lokalne', () => {
    expect(isFastPathEligible('http://example.com/video.mp4', 5 * 1024 * 1024, 5000)).toBe(false);
  });
});

