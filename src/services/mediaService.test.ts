import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_VIDEO_FILE_SIZE_BYTES, uploadImageAndCreateSnap, uploadVideoAndCreateSnap } from './mediaService';

const {
  mockUpload,
  mockGetCurrentUser,
  mockInsertSnap,
  mockGetInfoAsync,
  mockUploadResumable,
} = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockGetCurrentUser: vi.fn(),
  mockInsertSnap: vi.fn(),
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

vi.mock('./profileService', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock('./snapService', () => ({
  insertSnap: mockInsertSnap,
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
    expect(mockInsertSnap).toHaveBeenCalledWith(
      'receiver-1',
      'snaps/user-1/file.jpg',
      5,
      expect.objectContaining({ clientUploadId: expect.any(String) })
    );
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

    expect(mockInsertSnap).toHaveBeenCalledWith(
      'receiver-1',
      'snaps/user-1/file.jpg',
      180,
      expect.objectContaining({ clientUploadId: expect.any(String) })
    );
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

  it('wgrywa wideo strumieniowo (resumable) i tworzy rekord snapa', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 8 * 1024 * 1024 });
    mockInsertSnap.mockResolvedValue(undefined);
    mockUploadResumable.mockResolvedValue(undefined);

    await uploadVideoAndCreateSnap('file:///tmp/video.mp4', 'receiver-1', 12_000, 15);

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
    expect(mockInsertSnap).toHaveBeenCalledWith(
      'receiver-1',
      expect.stringMatching(/^snaps\/user-1\/.+\.mp4$/),
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

    await expect(uploadVideoAndCreateSnap('file:///tmp/video.mp4', 'receiver-1', 8_000)).rejects.toThrow(
      `Plik wideo jest za duży. Maksymalny rozmiar to ${Math.round(MAX_VIDEO_FILE_SIZE_BYTES / (1024 * 1024))} MB.`
    );
    expect(mockUploadResumable).not.toHaveBeenCalled();
  });

  it('rzuca czytelny błąd, gdy plik wideo jest pusty', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 0 });

    await expect(uploadVideoAndCreateSnap('file:///tmp/video.mp4', 'receiver-1', 5_000)).rejects.toThrow(
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

    await expect(uploadVideoAndCreateSnap('file:///tmp/video.mp4', 'receiver-1', 5_000)).rejects.toThrow(
      `Plik wideo przekracza limit uploadu serwera. Utrzymaj plik poniżej ${Math.round(
        MAX_VIDEO_FILE_SIZE_BYTES / (1024 * 1024)
      )} MB.`
    );
  });
});
