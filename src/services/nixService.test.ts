import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteConversationWithPeer,
  createSignedNixUrl,
  fetchSentNixes,
  flushCleanupQueue,
  insertNix,
  markNixViewedWithCleanup,
} from './nixService';

const {
  mockGetCurrentUser,
  mockInvoke,
  mockRpc,
  mockNixesSelectEq,
  mockNixesSelectOrder,
  mockNixesSelectLimit,
  mockNixesSelectEqValue,
  mockNixesUpdateEq,
  mockNixesUpsert,
  mockNixesInsert,
  mockQueueUpsert,
  mockQueueDeleteEq,
  mockQueueDelete,
  mockQueueUpdateEq,
  mockQueueUpdate,
  mockQueueSelectEq,
  mockQueueSelectLte,
  mockQueueSelectOrder,
  mockQueueSelectLimit,
  mockStorageFrom,
  mockCreateSignedUrl,
} = vi.hoisted(() => {
  const queueDeleteEq = vi.fn();
  const queueUpdateEq = vi.fn();
  const queueSelectLte = vi.fn();
  const queueSelectOrder = vi.fn();
  const queueSelectLimit = vi.fn();
  const nixesSelectOrder = vi.fn();
  const nixesSelectLimit = vi.fn();
  const nixesSelectEq = vi.fn();

  return {
    mockGetCurrentUser: vi.fn(),
    mockInvoke: vi.fn(),
    mockRpc: vi.fn(),
    mockNixesSelectEqValue: { order: nixesSelectOrder },
    mockNixesSelectEq: nixesSelectEq,
    mockNixesSelectOrder: nixesSelectOrder,
    mockNixesSelectLimit: nixesSelectLimit,
    mockNixesUpdateEq: vi.fn(),
    mockNixesUpsert: vi.fn(),
    mockNixesInsert: vi.fn(),
    mockQueueUpsert: vi.fn(),
    mockQueueDeleteEq: queueDeleteEq,
    mockQueueDelete: vi.fn(() => ({ eq: queueDeleteEq })),
    mockQueueUpdateEq: queueUpdateEq,
    mockQueueUpdate: vi.fn(() => ({ eq: queueUpdateEq })),
    mockQueueSelectEq: vi.fn(() => ({ lte: queueSelectLte })),
    mockQueueSelectLte: queueSelectLte,
    mockQueueSelectOrder: queueSelectOrder,
    mockQueueSelectLimit: queueSelectLimit,
    mockCreateSignedUrl: vi.fn(),
    mockStorageFrom: vi.fn(),
  };
});

vi.mock('./profileService', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: mockRpc,
    functions: {
      invoke: mockInvoke,
    },
    storage: {
      from: mockStorageFrom,
    },
    from: (table: string) => {
      if (table === 'nixes') {
        return {
          update: () => ({ eq: mockNixesUpdateEq }),
          insert: mockNixesInsert,
          upsert: mockNixesUpsert,
          select: () => ({
            eq: mockNixesSelectEq,
          }),
        };
      }

      if (table === 'nix_cleanup_queue') {
        return {
          upsert: mockQueueUpsert,
          delete: mockQueueDelete,
          update: mockQueueUpdate,
          select: () => ({
            eq: mockQueueSelectEq,
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

describe('nixService cleanup flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ id: 'receiver-1' });
    mockNixesUpdateEq.mockResolvedValue({ error: null });
    mockNixesSelectEq.mockReturnValue(mockNixesSelectEqValue);
    mockNixesSelectOrder.mockReturnValue({ limit: mockNixesSelectLimit });
    mockNixesSelectLimit.mockResolvedValue({ error: null, data: [] });
    mockRpc.mockResolvedValue({ error: null, data: [] });
    mockQueueUpsert.mockResolvedValue({ error: null });
    mockQueueDeleteEq.mockResolvedValue({ error: null });
    mockQueueUpdateEq.mockResolvedValue({ error: null });
    mockStorageFrom.mockReturnValue({ createSignedUrl: mockCreateSignedUrl });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.supabase.co/storage/v1/object/sign/media-vault/nix.jpg' },
      error: null,
    });
  });

  it('wywołuje edge cleanup i usuwa job z kolejki', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });

    await markNixViewedWithCleanup('nix-1', 'nixes/receiver-1/file.jpg');

    expect(mockInvoke).toHaveBeenCalledWith('cleanup-nix', {
      body: { nixId: 'nix-1', mediaPath: 'nixes/receiver-1/file.jpg' },
    });
    expect(mockQueueDeleteEq).toHaveBeenCalledWith('nix_id', 'nix-1');
  });

  it('zapisuje retry gdy cleanup edge nie działa', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('network') });

    // Cleanup failure is non-critical — function resolves but enqueues retry.
    await markNixViewedWithCleanup('nix-2', 'nixes/receiver-1/file2.jpg');
    expect(mockQueueUpdate).toHaveBeenCalled();
  });

  it('flushCleanupQueue ponawia oczekujące zadania', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    mockQueueSelectEq.mockReturnValue({
      lte: mockQueueSelectLte,
    });
    mockQueueSelectLte.mockReturnValue({
      order: mockQueueSelectOrder,
    });
    mockQueueSelectOrder.mockReturnValue({
      limit: mockQueueSelectLimit,
    });
    mockQueueSelectLimit.mockResolvedValue({
      error: null,
      data: [
        {
          nix_id: 'nix-queued',
          media_path: 'nixes/receiver-1/queued.jpg',
          receiver_id: 'receiver-1',
          attempt_count: 1,
        },
      ],
    });

    await flushCleanupQueue();

    expect(mockInvoke).toHaveBeenCalledWith('cleanup-nix', {
      body: { nixId: 'nix-queued', mediaPath: 'nixes/receiver-1/queued.jpg' },
    });
  });

  it('flushCleanupQueue zwiększa attempt_count po błędzie cleanup', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('cleanup failed') });
    mockQueueSelectEq.mockReturnValue({
      lte: mockQueueSelectLte,
    });
    mockQueueSelectLte.mockReturnValue({
      order: mockQueueSelectOrder,
    });
    mockQueueSelectOrder.mockReturnValue({
      limit: mockQueueSelectLimit,
    });
    mockQueueSelectLimit.mockResolvedValue({
      error: null,
      data: [
        {
          nix_id: 'nix-retry',
          media_path: 'nixes/receiver-1/retry.jpg',
          receiver_id: 'receiver-1',
          attempt_count: 2,
        },
      ],
    });

    await flushCleanupQueue();

    expect(mockQueueUpdate).toHaveBeenCalled();
    expect(mockQueueUpdateEq).toHaveBeenCalledWith('nix_id', 'nix-retry');
  });

  it('markNixViewedWithCleanup dodaje job do kolejki przed cleanup', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });

    await markNixViewedWithCleanup('nix-3', 'nixes/receiver-1/queued2.jpg');
    expect(mockQueueUpsert).toHaveBeenCalled();
  });

  it('markNixViewedWithCleanup zgłasza błąd cleanup edge przy niepoprawnej odpowiedzi', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: false }, error: null });
    await markNixViewedWithCleanup('nix-4', 'nixes/receiver-1/a.jpg');
    expect(mockQueueUpdate).toHaveBeenCalled();
  });

  it('deleteConversationWithPeer wywołuje poprawne RPC', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'sender-1' });
    mockRpc.mockResolvedValue({ error: null });

    await deleteConversationWithPeer('friend-2');

    expect(mockRpc).toHaveBeenCalledWith('delete_my_conversation_with_peer', {
      peer_profile_id: 'friend-2',
    });
  });

  it('deleteConversationWithPeer zwraca czytelny błąd gdy RPC nie istnieje', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'sender-1' });
    mockRpc.mockResolvedValue({
      error: {
        message:
          'Could not find the function public.delete_my_conversation_with_peer(peer_profile_id) in the schema cache',
      },
    });

    await expect(deleteConversationWithPeer('friend-2')).rejects.toThrow(
      'Usuwanie rozmowy jest chwilowo niedostępne'
    );
  });

  it('createSignedNixUrl wysyła całkowity expiresIn do Supabase Storage', async () => {
    await createSignedNixUrl('nixes/receiver-1/video.mp4', 94.712);

    expect(mockStorageFrom).toHaveBeenCalledWith('media-vault');
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('nixes/receiver-1/video.mp4', 95);
  });

  it('insertNix zapisuje thumbnail_b64 dla wideo', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'sender-1' });
    mockNixesUpsert.mockResolvedValue({ error: null });

    await insertNix('receiver-1', 'nixes/sender-1/v.mp4', 15, {
      mediaType: 'video',
      playbackDurationMs: 12_000,
      clientUploadId: 'abc',
      thumbnailB64: 'data:image/jpeg;base64,Zm9v',
    });

    expect(mockNixesUpsert).toHaveBeenCalledTimes(1);
    const [payload, opts] = mockNixesUpsert.mock.calls[0];
    expect(payload.media_type).toBe('video');
    expect(payload.thumbnail_b64).toBe('data:image/jpeg;base64,Zm9v');
    expect(payload.playback_duration_ms).toBe(12_000);
    expect(opts).toMatchObject({ onConflict: 'sender_id,receiver_id,client_upload_id' });
  });

  it('insertNix retry-uje bez thumbnail_b64, gdy kolumna nie istnieje', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'sender-1' });
    mockNixesUpsert
      .mockResolvedValueOnce({
        error: { message: "Could not find the 'thumbnail_b64' column of 'nixes'" },
      })
      .mockResolvedValueOnce({ error: null });

    await insertNix('receiver-1', 'nixes/sender-1/v2.mp4', 5, {
      mediaType: 'video',
      playbackDurationMs: 8_000,
      clientUploadId: 'def',
      thumbnailB64: 'data:image/jpeg;base64,Zm9v',
    });

    expect(mockNixesUpsert).toHaveBeenCalledTimes(2);
    const [retryPayload] = mockNixesUpsert.mock.calls[1];
    expect('thumbnail_b64' in retryPayload).toBe(false);
    expect(retryPayload.media_type).toBe('video');
  });

  it('insertNix pomija thumbnail_b64 dla obrazków', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'sender-1' });
    mockNixesUpsert.mockResolvedValue({ error: null });

    await insertNix('receiver-1', 'nixes/sender-1/img.jpg', 5, {
      mediaType: 'image',
      clientUploadId: 'img-1',
      // Wartość niedozwolona dla obrazów — powinna zostać zignorowana.
      thumbnailB64: 'data:image/jpeg;base64,XXX',
    });

    expect(mockNixesUpsert).toHaveBeenCalledTimes(1);
    const [payload] = mockNixesUpsert.mock.calls[0];
    expect('thumbnail_b64' in payload).toBe(false);
  });

  it('insertNix używa zwykłego insertu, gdy baza nie obsługuje celu ON CONFLICT', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'sender-1' });
    mockNixesUpsert.mockResolvedValue({
      error: {
        code: '42P10',
        message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification',
      },
    });
    mockNixesInsert.mockResolvedValue({ error: null });

    await insertNix('receiver-1', 'nixes/sender-1/fallback.jpg', 5, {
      mediaType: 'image',
      clientUploadId: 'fallback-1',
    });

    expect(mockNixesInsert).toHaveBeenCalledTimes(1);
    expect(mockNixesInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        sender_id: 'sender-1',
        receiver_id: 'receiver-1',
        client_upload_id: 'fallback-1',
      })
    );
  });

  it('insertNix uznaje duplikat fallbacku za zakończoną wcześniej wysyłkę', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'sender-1' });
    mockNixesUpsert.mockResolvedValue({
      error: {
        code: '42P10',
        message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification',
      },
    });
    mockNixesInsert.mockResolvedValue({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    await expect(
      insertNix('receiver-1', 'nixes/sender-1/already-sent.jpg', 5, {
        mediaType: 'image',
        clientUploadId: 'already-sent-1',
      })
    ).resolves.toBeUndefined();
  });

  it('insertNix nie przedstawia błędu uprawnień funkcji jako błędnego odbiorcy', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'sender-1' });
    mockNixesUpsert.mockResolvedValue({
      error: { message: 'permission denied for function can_send_nix' },
    });

    await expect(
      insertNix('receiver-1', 'nixes/sender-1/config-error.jpg', 5, {
        mediaType: 'image',
        clientUploadId: 'config-error-1',
      })
    ).rejects.toThrow('Konfiguracja wysyłki jest nieprawidłowa');
  });

  it('fetchSentNixes zwraca historię wysłanych z mapowaniem odbiorcy', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'sender-1' });
    mockNixesSelectEq.mockReturnValue({ order: mockNixesSelectOrder });
    mockNixesSelectOrder.mockReturnValue({ limit: mockNixesSelectLimit });
    mockNixesSelectLimit.mockResolvedValue({
      error: null,
      data: [
        {
          id: 'sent-1',
          receiver_id: 'friend-1',
          created_at: '2026-01-01T10:00:00.000Z',
          status: 'cleaned',
          viewed_at: '2026-01-01T10:01:00.000Z',
          cleaned_at: '2026-01-01T10:02:00.000Z',
        },
      ],
    });
    mockRpc.mockResolvedValue({
      error: null,
      data: [{ id: 'friend-1', username: 'nix_friend', avatar_emoji: '🦊' }],
    });

    const result = await fetchSentNixes();

    expect(result).toEqual([
      {
        id: 'sent-1',
        receiver_id: 'friend-1',
        created_at: '2026-01-01T10:00:00.000Z',
        status: 'cleaned',
        viewed_at: '2026-01-01T10:01:00.000Z',
        cleaned_at: '2026-01-01T10:02:00.000Z',
        receiver: { username: 'nix_friend', avatar_emoji: '🦊', avatar_storage_path: null },
      },
    ]);
    expect(mockNixesSelectEq).toHaveBeenCalledWith('sender_id', 'sender-1');
    expect(mockRpc).toHaveBeenCalledWith('get_public_profiles_by_ids', {
      profile_ids: ['friend-1'],
    });
  });
});
