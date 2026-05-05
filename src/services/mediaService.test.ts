import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_VIDEO_FILE_SIZE_BYTES, uploadImageAndCreateSnap, uploadVideoAndCreateSnap } from './mediaService';

const { mockUpload, mockGetCurrentUser, mockInsertSnap } = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockGetCurrentUser: vi.fn(),
  mockInsertSnap: vi.fn(),
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

vi.mock('./profileService', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock('./snapService', () => ({
  insertSnap: mockInsertSnap,
}));

describe('mediaService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wgrywa plik i tworzy rekord snapa', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockUpload.mockResolvedValue({ error: null, data: { path: 'snaps/user-1/file.jpg' } });
    mockInsertSnap.mockResolvedValue(undefined);

    const blob = new Blob(['test'], { type: 'image/jpeg' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        blob: async () => blob,
        arrayBuffer: async () => blob.arrayBuffer(),
      })
    );

    await uploadImageAndCreateSnap('file:///tmp/image.jpg', 'receiver-1');

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockInsertSnap).toHaveBeenCalledWith('receiver-1', 'snaps/user-1/file.jpg', 5);
  });

  it('przekazuje niestandardowy czas wyświetlania do rekordu snapa', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockUpload.mockResolvedValue({ error: null, data: { path: 'snaps/user-1/file.jpg' } });
    mockInsertSnap.mockResolvedValue(undefined);

    const blob = new Blob(['test'], { type: 'image/jpeg' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        blob: async () => blob,
        arrayBuffer: async () => blob.arrayBuffer(),
      })
    );

    await uploadImageAndCreateSnap('file:///tmp/image.jpg', 'receiver-1', 180);

    expect(mockInsertSnap).toHaveBeenCalledWith('receiver-1', 'snaps/user-1/file.jpg', 180);
  });

  it('rzuca błąd gdy brak zalogowanego użytkownika', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await expect(uploadImageAndCreateSnap('file:///tmp/image.jpg', 'receiver-1')).rejects.toThrow(
      'Brak autoryzacji.'
    );
  });

  it('rzuca błąd gdy obraz jest pusty', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        blob: async () => new Blob([], { type: 'image/jpeg' }),
        arrayBuffer: async () => new ArrayBuffer(0),
      })
    );

    await expect(uploadImageAndCreateSnap('file:///tmp/image.jpg', 'receiver-1')).rejects.toThrow(
      'Nie udało się odczytać pliku do wysyłki.'
    );
  });

  it('wgrywa wideo i tworzy rekord snapa', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockUpload.mockResolvedValue({ error: null, data: { path: 'snaps/user-1/file.mp4' } });
    mockInsertSnap.mockResolvedValue(undefined);

    const videoBuffer = new Uint8Array([1, 2, 3, 4]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        arrayBuffer: async () => videoBuffer.buffer,
      })
    );

    await uploadVideoAndCreateSnap('file:///tmp/video.mp4', 'receiver-1', 12_000, 15);

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockInsertSnap).toHaveBeenCalledWith('receiver-1', 'snaps/user-1/file.mp4', 15, {
      mediaType: 'video',
      playbackDurationMs: 12_000,
    });
  });

  it('rzuca czytelny błąd, gdy plik wideo przekracza limit', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });

    const tooLarge = new Uint8Array(MAX_VIDEO_FILE_SIZE_BYTES + 1);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        arrayBuffer: async () => tooLarge.buffer,
      })
    );

    await expect(uploadVideoAndCreateSnap('file:///tmp/video.mp4', 'receiver-1', 8_000)).rejects.toThrow(
      'Plik wideo jest za duży. Maksymalny rozmiar to 400 MB.'
    );
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('mapuje błąd Supabase o przekroczeniu rozmiaru na komunikat domenowy', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockUpload.mockResolvedValue({
      error: { message: 'The object exceeded the maximum allowed size' },
      data: null,
    });

    const videoBuffer = new Uint8Array([1, 2, 3, 4]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        arrayBuffer: async () => videoBuffer.buffer,
      })
    );

    await expect(uploadVideoAndCreateSnap('file:///tmp/video.mp4', 'receiver-1', 5_000)).rejects.toThrow(
      'Plik wideo przekracza limit 400 MB.'
    );
  });
});
