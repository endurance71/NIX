import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESUMABLE_CHUNK_SIZE_BYTES, uploadResumable } from './resumableUploadService';

const { mockReadAsStringAsync, mockGetSession, mockUploadCtor } = vi.hoisted(() => ({
  mockReadAsStringAsync: vi.fn(),
  mockGetSession: vi.fn(),
  mockUploadCtor: vi.fn(),
}));

vi.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: mockReadAsStringAsync,
  // Helpery używane przez mediaService — nieistotne dla tego testu, ale muszą istnieć,
  // jeśli któryś z importów ich potrzebuje.
  getInfoAsync: vi.fn(),
  deleteAsync: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock('tus-js-client', () => ({
  Upload: mockUploadCtor,
}));

vi.mock('base64-js', () => ({
  toByteArray: vi.fn((b64: string) => new Uint8Array(Math.floor((b64.length * 3) / 4))),
}));

describe('resumableUploadService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token-1' } } });
    // Każdy chunk czytany przez ChunkedFileReader zwraca długi base64.
    mockReadAsStringAsync.mockResolvedValue('a'.repeat(8000));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('konstruuje tus.Upload z poprawnym endpointem, nagłówkami i metadata', async () => {
    let capturedOpts: any = null;
    mockUploadCtor.mockImplementation(function (this: any, _file: any, opts: any) {
      capturedOpts = opts;
      return {
        start: () => {
          setTimeout(() => opts.onSuccess({ lastResponse: { getStatus: () => 200 } }), 0);
        },
        abort: vi.fn().mockResolvedValue(undefined),
      };
    });

    await uploadResumable({
      bucket: 'media-vault',
      objectPath: 'nixes/user-1/file.mp4',
      fileUri: 'file:///tmp/file.mp4',
      contentType: 'video/mp4',
      fileSizeBytes: 12 * 1024 * 1024,
      cacheControl: '3600',
      upsert: false,
    });

    expect(mockUploadCtor).toHaveBeenCalledTimes(1);
    expect(capturedOpts.endpoint).toBe('https://example.supabase.co/storage/v1/upload/resumable');
    expect(capturedOpts.headers.authorization).toBe('Bearer token-1');
    expect(capturedOpts.headers['x-upsert']).toBe('false');
    expect(capturedOpts.metadata).toEqual({
      bucketName: 'media-vault',
      objectName: 'nixes/user-1/file.mp4',
      contentType: 'video/mp4',
      cacheControl: '3600',
    });
    expect(capturedOpts.uploadSize).toBe(12 * 1024 * 1024);
    expect(capturedOpts.chunkSize).toBe(RESUMABLE_CHUNK_SIZE_BYTES);
  });

  it('używa natywnego trybu uri (bez custom fileReader)', async () => {
    let capturedOpts: any = null;
    mockUploadCtor.mockImplementation(function (this: any, _file: any, opts: any) {
      capturedOpts = opts;
      return {
        start: () => {
          setTimeout(() => opts.onSuccess({}), 0);
        },
        abort: vi.fn().mockResolvedValue(undefined),
      };
    });

    await uploadResumable({
      bucket: 'media-vault',
      objectPath: 'nixes/user-1/v.mp4',
      fileUri: 'file:///tmp/v.mp4',
      contentType: 'video/mp4',
      fileSizeBytes: RESUMABLE_CHUNK_SIZE_BYTES * 2 + 100,
    });

    expect(capturedOpts.fileReader).toBeUndefined();
    expect(mockReadAsStringAsync).not.toHaveBeenCalled();
  });

  it('przerywa upload po `signal.abort()` i odrzuca z DomainError CANCELLED', async () => {
    const abortSpy = vi.fn().mockResolvedValue(undefined);
    mockUploadCtor.mockImplementation(function (this: any, _file: any, _opts: any) {
      return {
        start: () => {
          // Symuluj długi upload — sukces nigdy nie nadejdzie samoczynnie.
        },
        abort: abortSpy,
      };
    });

    const controller = new AbortController();
    const promise = uploadResumable({
      bucket: 'media-vault',
      objectPath: 'nixes/user-1/big.mp4',
      fileUri: 'file:///tmp/big.mp4',
      contentType: 'video/mp4',
      fileSizeBytes: 50 * 1024 * 1024,
      signal: controller.signal,
    });

    // Daj mikrotaskowi czas na zarejestrowanie listenera abort.
    await Promise.resolve();
    controller.abort();

    await expect(promise).rejects.toThrow('Wysyłka została anulowana.');
    expect(abortSpy).toHaveBeenCalledWith(true);
  });

  it('zwraca onShouldRetry=false dla statusów autoryzacyjnych', async () => {
    let capturedOpts: any = null;
    mockUploadCtor.mockImplementation(function (this: any, _file: any, opts: any) {
      capturedOpts = opts;
      return {
        start: () => {
          setTimeout(() => opts.onSuccess({}), 0);
        },
        abort: vi.fn().mockResolvedValue(undefined),
      };
    });

    await uploadResumable({
      bucket: 'media-vault',
      objectPath: 'nixes/user-1/auth.mp4',
      fileUri: 'file:///tmp/auth.mp4',
      contentType: 'video/mp4',
      fileSizeBytes: 1024,
    });

    const make = (status: number) => ({ originalResponse: { getStatus: () => status } } as any);
    expect(capturedOpts.onShouldRetry(make(401), 0, capturedOpts)).toBe(false);
    expect(capturedOpts.onShouldRetry(make(403), 0, capturedOpts)).toBe(false);
    expect(capturedOpts.onShouldRetry(make(409), 0, capturedOpts)).toBe(false);
    expect(capturedOpts.onShouldRetry(make(413), 0, capturedOpts)).toBe(false);
    expect(capturedOpts.onShouldRetry(make(503), 0, capturedOpts)).toBe(true);
  });

  it('rzuca błąd autoryzacji, gdy brak access_token w sesji', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });

    await expect(
      uploadResumable({
        bucket: 'media-vault',
        objectPath: 'nixes/user-1/no-auth.mp4',
        fileUri: 'file:///tmp/no-auth.mp4',
        contentType: 'video/mp4',
        fileSizeBytes: 1024,
      })
    ).rejects.toThrow('Sesja użytkownika wygasła.');
  });
});
