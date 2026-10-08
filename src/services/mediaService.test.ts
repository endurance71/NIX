import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_IMAGE_FILE_SIZE_BYTES,
  MAX_VIDEO_FILE_SIZE_BYTES,
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
  it('limits prepared images to 4 MiB while allowing larger source images', async () => {
    const { CHAT_PASTE_MAX_IMAGE_BYTES } = await import('../lib/chatPaste');
    expect(MAX_IMAGE_FILE_SIZE_BYTES).toBe(4 * 1024 * 1024);
    expect(CHAT_PASTE_MAX_IMAGE_BYTES).toBeGreaterThanOrEqual(MAX_IMAGE_FILE_SIZE_BYTES);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Domyślny rozmiar pliku — 4 bajty (testowy stub).
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 4 });
    mockVideoCompress.mockResolvedValue('file:///tmp/compressed.mp4');
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
