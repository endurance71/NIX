import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_IMAGE_FILE_SIZE_BYTES,
  MAX_VIDEO_FILE_SIZE_BYTES,
  uploadImageAndCreateNix,
  uploadVideoAndCreateNix,
  isFastPathEligible,
  prepareVideoForUpload,
} from './mediaService';

const {
  mockUpload,
  mockGetCurrentUser,
  mockInsertNix,
  mockGetInfoAsync,
  mockUploadResumable,
  mockVideoCompress,
} = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockGetCurrentUser: vi.fn(),
  mockInsertNix: vi.fn(),
  mockGetInfoAsync: vi.fn(),
  mockUploadResumable: vi.fn(),
  mockVideoCompress: vi.fn().mockResolvedValue('file:///tmp/compressed.mp4'),
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
    compress: mockVideoCompress,
  },
}));

vi.mock('expo-image-manipulator', () => {
  const image = {
    saveAsync: vi.fn().mockResolvedValue({ uri: 'file:///tmp/out.jpg' }),
    release: vi.fn(),
  };
  const context = {
    resize: vi.fn().mockReturnThis(),
    renderAsync: vi.fn().mockResolvedValue(image),
    release: vi.fn(),
  };
  return {
    ImageManipulator: {
      manipulate: vi.fn(() => context),
    },
    SaveFormat: { JPEG: 'jpeg' },
  };
});

vi.mock('../lib/videoThumbnails', () => ({
  generateVideoThumbnailAtTime: vi.fn().mockResolvedValue(null),
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
  it('eksportuje ten sam limit obrazu co wklejanie do czatu', async () => {
    const { CHAT_PASTE_MAX_IMAGE_BYTES } = await import('../lib/chatPaste');
    expect(MAX_IMAGE_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_IMAGE_FILE_SIZE_BYTES).toBe(CHAT_PASTE_MAX_IMAGE_BYTES);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Domyślny rozmiar pliku — 4 bajty (testowy stub).
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 4 });
    mockVideoCompress.mockResolvedValue('file:///tmp/compressed.mp4');
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

  it('przekazuje audioBitrate 96 kbps do Video.compress na syntetycznym materiale', async () => {
    // isTestRuntime() omija native compress — tymczasowo wyłącz skrót.
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    vi.stubGlobal('navigator', { product: 'ReactNative' });
    // 8 MB / 12 s ≈ 5.3 Mb/s → powyżej passthrough 1.8 Mb/s.
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 8 * 1024 * 1024 });
    mockVideoCompress.mockResolvedValue('file:///tmp/compressed.mp4');

    try {
      await prepareVideoForUpload('file:///tmp/synth-video.mp4', { playbackDurationMs: 12_000 });
    } finally {
      process.env.NODE_ENV = prevEnv;
      vi.unstubAllGlobals();
    }

    expect(mockVideoCompress).toHaveBeenCalledTimes(1);
    expect(mockVideoCompress).toHaveBeenCalledWith(
      'file:///tmp/synth-video.mp4',
      expect.objectContaining({
        compressionMethod: 'manual',
        bitrate: 1_800_000,
        audioBitrate: 96_000,
        maxSize: 1280,
      }),
      expect.any(Function)
    );
  });

  it('przekazuje audioBitrate 96 kbps także w agresywnym drugim przebiegu kompresji', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    vi.stubGlobal('navigator', { product: 'ReactNative' });
    const overLimit = MAX_VIDEO_FILE_SIZE_BYTES + 1024;
    mockGetInfoAsync
      .mockResolvedValueOnce({ exists: true, size: overLimit }) // original
      .mockResolvedValueOnce({ exists: true, size: overLimit }) // first-pass still too large
      .mockResolvedValue({ exists: true, size: 4 * 1024 * 1024 }); // after aggressive / final
    mockVideoCompress
      .mockResolvedValueOnce('file:///tmp/compressed-pass1.mp4')
      .mockResolvedValueOnce('file:///tmp/compressed-pass2.mp4');

    try {
      await prepareVideoForUpload('file:///tmp/synth-large.mp4', { playbackDurationMs: 12_000 });
    } finally {
      process.env.NODE_ENV = prevEnv;
      vi.unstubAllGlobals();
    }

    expect(mockVideoCompress).toHaveBeenCalledTimes(2);
    expect(mockVideoCompress).toHaveBeenNthCalledWith(
      1,
      'file:///tmp/synth-large.mp4',
      expect.objectContaining({ audioBitrate: 96_000 }),
      expect.any(Function)
    );
    expect(mockVideoCompress).toHaveBeenNthCalledWith(
      2,
      'file:///tmp/compressed-pass1.mp4',
      expect.objectContaining({
        audioBitrate: 96_000,
        bitrate: 900_000,
        maxSize: 960,
      }),
      expect.any(Function)
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
  it('zwraca false dla małego, ale bardzo wysokobitratowego klipu', () => {
    expect(isFastPathEligible('file:///test.mp4', 5 * 1024 * 1024, 1000)).toBe(false);
  });

  it('zwraca true dla pliku z bitratem poniżej docelowych 1,8 Mb/s', () => {
    const size = 10 * 1024 * 1024;
    const duration = 60_000;
    expect(isFastPathEligible('file:///test.mp4', size, duration)).toBe(true);
  });

  it('zwraca false dla pliku z bitratem wyższym niż profil docelowy', () => {
    const size = 20 * 1024 * 1024; // 20 MB
    const duration = 10000; // 10s
    // 20 MB * 8 / 10s = 16 Mbps
    expect(isFastPathEligible('file:///test.mp4', size, duration)).toBe(false);
  });

  it('nie omija kompresji dla pliku ponad 100 MB nawet przy niskim bitrate', () => {
    expect(
      isFastPathEligible(
        'file:///test.mp4',
        MAX_VIDEO_FILE_SIZE_BYTES + 1,
        20 * 60_000
      )
    ).toBe(false);
  });

  it('zwraca false, gdy uri nie jest lokalne', () => {
    expect(isFastPathEligible('http://example.com/video.mp4', 5 * 1024 * 1024, 5000)).toBe(false);
  });
});
