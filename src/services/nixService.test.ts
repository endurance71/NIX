import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteConversationWithPeer,
  createSignedNixUrl,
  fetchInboxNixes,
  fetchSentNixes,
  flushCleanupQueue,
  markNixReplayedWithCleanup,
} from './nixService';

const {
  mockGetCurrentUser,
  mockInvoke,
  mockRpc,
  mockNixesSelect,
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
  const nixesSelect = vi.fn(() => ({
    eq: nixesSelectEq,
  }));

  return {
    mockGetCurrentUser: vi.fn(),
    mockInvoke: vi.fn(),
    mockRpc: vi.fn(),
    mockNixesSelect: nixesSelect,
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

vi.mock('../lib/encryptedPhotoCache', () => ({ encryptedPhotoCache: { remove: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('./photoCacheService', () => ({ retainPrivatePhotoForReplay: vi.fn() }));
vi.mock('../lib/supabase', () => {
  const client = {
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
          select: mockNixesSelect,
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
  };
  return { supabase: client, captureAccountTransport: async () => ({ ownerId: 'receiver-1', client, assertActive() {}, signal: new AbortController().signal }) };
});

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

  it('requests canonical cleanup by NiX id without client queue mutations', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    await markNixReplayedWithCleanup('nix-1', 'untrusted/legacy/path.jpg');
    expect(mockRpc).toHaveBeenCalledWith('mark_nix_replayed', { p_nix_id: 'nix-1' });
    expect(mockRpc).toHaveBeenCalledWith('request_nix_cleanup', { p_nix_id: 'nix-1' });
    expect(mockInvoke).toHaveBeenCalledWith('cleanup-nix', { body: { nixId: 'nix-1' } });
    expect(mockQueueUpsert).not.toHaveBeenCalled();
    expect(mockQueueUpdate).not.toHaveBeenCalled();
    expect(mockQueueDelete).not.toHaveBeenCalled();
  });

  it('keeps server queue authoritative when Edge cleanup fails', async () => {
    mockInvoke.mockResolvedValue({ error: new Error('offline') });
    await expect(markNixReplayedWithCleanup('nix-1', 'arbitrary/path.jpg')).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith('request_nix_cleanup', { p_nix_id: 'nix-1' });
    expect(mockQueueUpdate).not.toHaveBeenCalled();
  });

  it('does not invoke Edge if the canonical queue request rejects', async () => {
    mockRpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: 'REPLAY_WINDOW_ACTIVE' } });
    await expect(markNixReplayedWithCleanup('nix-1')).rejects.toThrow('REPLAY_WINDOW_ACTIVE');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('flushes pending canonical ids without changing attempt counts or paths', async () => {
    mockQueueSelectLte.mockReturnValue({ order: mockQueueSelectOrder });
    mockQueueSelectOrder.mockReturnValue({ limit: mockQueueSelectLimit });
    mockQueueSelectLimit.mockResolvedValue({ data: [{ nix_id: 'nix-1' }], error: null });
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    await flushCleanupQueue();
    expect(mockInvoke).toHaveBeenCalledWith('cleanup-nix', { body: { nixId: 'nix-1' } });
    expect(mockQueueUpdate).not.toHaveBeenCalled();
    expect(mockQueueDelete).not.toHaveBeenCalled();
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
        receiver: { username: 'nix_friend', display_name: null, avatar_emoji: '🦊', avatar_storage_path: null },
      },
    ]);
    expect(mockNixesSelectEq).toHaveBeenCalledWith('sender_id', 'sender-1');
    expect(mockRpc).toHaveBeenCalledWith('get_public_profiles_by_ids', {
      profile_ids: ['friend-1'],
    });
  });

  it('fetchInboxNixes populates sender display_name from public profiles', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'receiver-1' });
    mockNixesSelectEq.mockReturnValue({ order: mockNixesSelectOrder });
    mockNixesSelectOrder.mockReturnValue({ limit: mockNixesSelectLimit });
    mockNixesSelectLimit.mockResolvedValue({
      error: null,
      data: [
        {
          id: 'nix-1',
          sender_id: 'sender-1',
          media_path: 'path/1.jpg',
          media_type: 'image',
          created_at: '2026-01-01T10:00:00.000Z',
          is_viewed: false,
          status: 'sent',
          view_duration_sec: 5,
        },
      ],
    });
    mockRpc.mockResolvedValue({
      error: null,
      data: [
        {
          id: 'sender-1',
          username: 'emulator',
          display_name: 'emulator_nazwa',
          avatar_emoji: '🦊',
          avatar_storage_path: null,
        },
      ],
    });

    const result = await fetchInboxNixes();

    expect(mockNixesSelect).toHaveBeenCalled();
    const selectArg = String(mockNixesSelect.mock.calls.at(0)?.at(0) ?? '');
    expect(selectArg).not.toContain('thumbnail_b64');
    expect(result[0].thumbnail_b64).toBeNull();
    expect(result[0].sender).toEqual({
      username: 'emulator',
      display_name: 'emulator_nazwa',
      avatar_emoji: '🦊',
      avatar_storage_path: null,
    });
  });
});
