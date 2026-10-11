import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AVATAR_CACHE_CONTROL_SEC,
  AVATAR_UPLOAD_JPEG_QUALITY,
  AVATAR_UPLOAD_SIZE_PX,
  prepareAvatarImageForUpload,
  uploadProfileAvatarFromUri,
} from './avatarService';

const mocks = vi.hoisted(() => {
  const contexts: {
    source: unknown;
    resize: ReturnType<typeof vi.fn>;
    renderAsync: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  }[] = [];
  const images: { width: number; height: number; saveAsync: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }[] = [];
  let nextSizes: { width: number; height: number }[] = [];

  const makeImage = (size: { width: number; height: number }, uri: string) => {
    const image = {
      ...size,
      saveAsync: vi.fn().mockResolvedValue({ uri, ...size }),
      release: vi.fn(),
    };
    images.push(image);
    return image;
  };

  const manipulate = vi.fn((source: unknown) => {
    const index = contexts.length;
    const context = {
      source,
      resize: vi.fn().mockReturnThis(),
      renderAsync: vi.fn(async () =>
        makeImage(nextSizes[index] ?? { width: 384, height: 384 }, `file:///tmp/avatar-${index}.jpg`)
      ),
      release: vi.fn(),
    };
    contexts.push(context);
    return context;
  });

  return {
    contexts,
    images,
    manipulate,
    setSizes(sizes: { width: number; height: number }[]) {
      nextSizes = sizes;
    },
    getImageBytes: vi.fn(async (_uri: string) => new Uint8Array(1024)),
    getCurrentUser: vi.fn(async () => ({ id: 'user-1' })),
    getCurrentUserProfile: vi.fn(async () => ({ avatar_storage_path: 'user-1/old.jpg' })),
    upload: vi.fn(async (path: string) => ({ data: { path }, error: null })),
    remove: vi.fn(async () => ({ error: null })),
    profileUpdateEq: vi.fn(async () => ({ error: null })),
  };
});

vi.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: mocks.manipulate },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

vi.mock('./mediaService', () => ({
  getImageBytes: mocks.getImageBytes,
  buildContentType: (fileUri: string) => {
    const ext = fileUri.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg';
    return { ext, contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` };
  },
  NIX_ALLOWED_IMAGE_TYPES: new Set(['image/jpeg', 'image/png', 'image/webp']),
}));

vi.mock('./profileService', () => ({
  getCurrentUser: mocks.getCurrentUser,
  getCurrentUserProfile: mocks.getCurrentUserProfile,
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({ upload: mocks.upload, remove: mocks.remove }),
    },
    from: () => ({ update: () => ({ eq: mocks.profileUpdateEq }) }),
  },
}));

describe('avatar upload (PERF-18 / DB-13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contexts.length = 0;
    mocks.images.length = 0;
    mocks.setSizes([]);
  });

  it('downscales a large crop to a 384 px JPEG and releases native refs', async () => {
    mocks.setSizes([{ width: 1536, height: 1536 }, { width: 384, height: 384 }]);

    const uri = await prepareAvatarImageForUpload('file:///tmp/crop.png');

    expect(uri).toBe('file:///tmp/avatar-1.jpg');
    expect(mocks.contexts[1].source).toBe(mocks.images[0]);
    expect(mocks.contexts[1].resize).toHaveBeenCalledWith({ width: AVATAR_UPLOAD_SIZE_PX });
    expect(mocks.images[1].saveAsync).toHaveBeenCalledWith({ compress: AVATAR_UPLOAD_JPEG_QUALITY, format: 'jpeg' });
    expect(mocks.images.every((image) => image.release.mock.calls.length === 1)).toBe(true);
    expect(mocks.contexts.every((context) => context.release.mock.calls.length === 1)).toBe(true);
  });

  it('resizes portrait sources by height', async () => {
    mocks.setSizes([{ width: 1000, height: 2000 }]);

    await prepareAvatarImageForUpload('file:///tmp/portrait.jpg');

    expect(mocks.contexts[1].resize).toHaveBeenCalledWith({ height: AVATAR_UPLOAD_SIZE_PX });
  });

  it('never upscales small sources, only re-encodes them', async () => {
    mocks.setSizes([{ width: 200, height: 200 }]);

    const uri = await prepareAvatarImageForUpload('file:///tmp/small.heic');

    expect(uri).toBe('file:///tmp/avatar-0.jpg');
    expect(mocks.contexts).toHaveLength(1);
    expect(mocks.contexts[0].resize).not.toHaveBeenCalled();
  });

  it('falls back to the original URI when the manipulator fails', async () => {
    mocks.manipulate.mockImplementationOnce(() => ({
      source: null,
      resize: vi.fn(),
      renderAsync: vi.fn().mockRejectedValue(new Error('decode failed')),
      release: vi.fn(),
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(prepareAvatarImageForUpload('file:///tmp/broken.jpg')).resolves.toBe('file:///tmp/broken.jpg');
    warn.mockRestore();
  });

  it('uploads the resized JPEG to a fresh immutable path with a one-year cache', async () => {
    mocks.setSizes([{ width: 1536, height: 1536 }, { width: 384, height: 384 }]);

    await uploadProfileAvatarFromUri('file:///tmp/crop.png');

    expect(mocks.getImageBytes).toHaveBeenCalledWith('file:///tmp/avatar-1.jpg');
    expect(AVATAR_CACHE_CONTROL_SEC).toBe('31536000');
    const [path, , options] = mocks.upload.mock.calls[0] as unknown as [string, Uint8Array, Record<string, unknown>];
    expect(path).toMatch(/^user-1\/\d+_[a-z0-9]+\.jpg$/);
    expect(options).toEqual({ contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
    expect(mocks.remove).toHaveBeenCalledWith(['user-1/old.jpg']);
  });
});
