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
  mockGetInfoAsync,
  mockVideoCompress,
} = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockGetCurrentUser: vi.fn(),
  mockGetInfoAsync: vi.fn(),
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

describe('prepareVideoForUpload progress', () => {
  async function runOutsideTestRuntime<T>(run: () => Promise<T>) {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    vi.stubGlobal('navigator', { product: 'ReactNative' });
    try {
      return await run();
    } finally {
      process.env.NODE_ENV = prevEnv;
      vi.unstubAllGlobals();
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never reports lower progress across the aggressive pass and thumbnail step', async () => {
    const overLimit = MAX_VIDEO_FILE_SIZE_BYTES + 1024;
    mockGetInfoAsync
      .mockResolvedValueOnce({ exists: true, size: overLimit })
      .mockResolvedValueOnce({ exists: true, size: overLimit })
      .mockResolvedValue({ exists: true, size: 4 * 1024 * 1024 });
    mockVideoCompress.mockImplementation(async (uri: string, _options: unknown, onProgress: (p: number) => void) => {
      onProgress(0.5);
      onProgress(1);
      return uri.includes('pass1') ? 'file:///tmp/compressed-pass2.mp4' : 'file:///tmp/compressed-pass1.mp4';
    });
    const reported: number[] = [];

    await runOutsideTestRuntime(() => prepareVideoForUpload('file:///tmp/large.mp4', {
      playbackDurationMs: 12_000,
      onProgress: ({ progress }) => reported.push(progress),
    }));

    expect(mockVideoCompress).toHaveBeenCalledTimes(2);
    expect(reported.length).toBeGreaterThan(4);
    for (let index = 1; index < reported.length; index += 1) {
      expect(reported[index]).toBeGreaterThanOrEqual(reported[index - 1]);
    }
    expect(reported.at(-1)).toBe(1);
  });

  it('skips transcoding a camera clip whose whole-file bitrate includes audio and container', async () => {
    // 12 s at ≈1.97 Mb/s (1.8 Mb/s video + audio + MP4 atoms).
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: Math.round((1_970_000 * 12) / 8) });

    await runOutsideTestRuntime(() => prepareVideoForUpload('file:///tmp/camera.mp4', {
      playbackDurationMs: 12_000,
      sourceWidth: 720,
      sourceHeight: 1280,
    }));

    expect(mockVideoCompress).not.toHaveBeenCalled();
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

  it('toleruje audio i kontener dla klipu z kamery o znanych wymiarach', () => {
    const size = Math.round((1_970_000 * 10) / 8);
    expect(isFastPathEligible('file:///test.mp4', size, 10_000)).toBe(false);
    expect(isFastPathEligible('file:///test.mp4', size, 10_000, { width: 720, height: 1280 })).toBe(true);
    expect(isFastPathEligible('file:///test.mp4', size, 10_000, { width: 1080, height: 1920 })).toBe(false);
  });

  it('zwraca false, gdy uri nie jest lokalne', () => {
    expect(isFastPathEligible('http://example.com/video.mp4', 5 * 1024 * 1024, 5000)).toBe(false);
  });
});
