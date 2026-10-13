import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteConversationWithPeer,
  createSignedNixUrl,
  fetchChatNixesWithPeer,
  fetchInboxBundleRpc,
  fetchInboxNixes,
  fetchSentNixes,
  fetchUnreadInboxQueueFromSender,
  isMissingRpcError,
  UNREAD_SENDER_QUEUE_LIMIT,
  flushCleanupQueue,
  markNixReplayedWithCleanup,
  resetChatNixesRpcFallback,
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

describe('get_inbox_bundle RPC client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the RPC once with the inbox page limit and normalizes the payload', async () => {
    mockRpc.mockResolvedValue({
      error: null,
      data: {
        inbox: [{ id: 'in-1', sender_id: 's-1' }],
        sent: [{ id: 'out-1', receiver_id: 'r-1', client_upload_id: 'u-1' }],
        texts: [{ id: 't-1', peer_id: 's-1' }],
        read_states: [{ peer_id: 's-1', last_read_at: '2026-10-10T10:00:00+00:00' }],
        profiles: [{ id: 's-1', username: 'one' }],
        unread_count: 4,
      },
    });

    const result = await fetchInboxBundleRpc();

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('get_inbox_bundle', { p_limit: 100 });
    expect(result?.inbox).toHaveLength(1);
    expect(result?.sent[0].client_upload_id).toBe('u-1');
    expect(result?.unread_count).toBe(4);
  });

  it('tolerates missing lists in the payload', async () => {
    mockRpc.mockResolvedValue({ error: null, data: { unread_count: null } });

    await expect(fetchInboxBundleRpc()).resolves.toEqual({
      inbox: [],
      sent: [],
      texts: [],
      read_states: [],
      profiles: [],
      unread_count: 0,
    });
  });

  it.each([
    { code: 'PGRST202', message: 'Could not find the function public.get_inbox_bundle(p_limit) in the schema cache' },
    { code: '42883', message: 'function public.get_inbox_bundle(integer) does not exist' },
  ])('returns null when the RPC is not deployed ($code)', async (error) => {
    mockRpc.mockResolvedValue({ error, data: null });

    await expect(fetchInboxBundleRpc()).resolves.toBeNull();
  });

  it('throws other database errors instead of falling back', async () => {
    mockRpc.mockResolvedValue({ error: { code: '57014', message: 'canceling statement due to statement timeout' }, data: null });

    await expect(fetchInboxBundleRpc()).rejects.toThrow('statement timeout');
  });

  it('detects a missing RPC only for the named function or explicit codes', () => {
    expect(isMissingRpcError({ code: 'PGRST202', message: '' }, 'get_inbox_bundle')).toBe(true);
    expect(
      isMissingRpcError(
        { message: 'Could not find the function public.get_inbox_bundle in the schema cache' },
        'get_inbox_bundle'
      )
    ).toBe(true);
    expect(isMissingRpcError({ code: '42501', message: 'permission denied' }, 'get_inbox_bundle')).toBe(false);
    expect(isMissingRpcError(null, 'get_inbox_bundle')).toBe(false);
  });
});

describe('fetchUnreadInboxQueueFromSender (DB-7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('limits the unread FIFO queue and keeps the poster thumbnail', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'receiver-1' });
    const limit = vi.fn().mockResolvedValue({
      error: null,
      data: [
        {
          id: 'nix-1',
          sender_id: 'sender-1',
          media_path: 'nixes/sender-1/a.mp4',
          media_type: 'video',
          playback_duration_ms: 3000,
          thumbnail_b64: 'data:image/jpeg;base64,AAAA',
          created_at: new Date().toISOString(),
          is_viewed: false,
          status: 'sent',
          view_duration_sec: 5,
        },
      ],
    });
    const order = vi.fn(() => ({ limit }));
    const gt = vi.fn(() => ({ order }));
    const chain: { eq: ReturnType<typeof vi.fn>; not: ReturnType<typeof vi.fn> } = {
      eq: vi.fn(() => chain),
      not: vi.fn(() => ({ gt })),
    };
    mockNixesSelect.mockReturnValueOnce(chain as never);

    const result = await fetchUnreadInboxQueueFromSender('sender-1');

    expect(String(mockNixesSelect.mock.calls.at(0)?.at(0) ?? '')).toContain('thumbnail_b64');
    // NiXes past the 30-day retention may have lost their file; they never enter the queue.
    expect(gt).toHaveBeenCalledWith('created_at', expect.any(String));
    expect(order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(limit).toHaveBeenCalledWith(UNREAD_SENDER_QUEUE_LIMIT);
    expect(UNREAD_SENDER_QUEUE_LIMIT).toBe(20);
    expect(result).toHaveLength(1);
    expect(result[0].thumbnail_b64).toBe('data:image/jpeg;base64,AAAA');
  });
});

describe('fetchChatNixesWithPeer (DB-10 two-branch RPC)', () => {
  const rpcRow = {
    id: 'nix-1',
    sender_id: 'peer-1',
    receiver_id: 'me-1',
    created_at: '2026-10-10T10:00:00.000Z',
    media_path: 'nixes/peer-1/a.mp4',
    media_type: 'video',
    is_viewed: false,
    is_replayed: false,
    replay_expires_at: null,
    status: 'sent',
    view_duration_sec: 15,
    playback_duration_ms: 3000,
    client_upload_id: null,
  };

  function mockLegacyChatSelect(rows: unknown[]) {
    const limit = vi.fn().mockResolvedValue({ error: null, data: rows });
    const order = vi.fn(() => ({ limit }));
    const or = vi.fn(() => ({ order }));
    mockNixesSelect.mockReturnValueOnce({ or } as never);
    return { or, order, limit };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resetChatNixesRpcFallback();
  });

  it('reads the chat page through the RPC and maps direction without a thumbnail', async () => {
    mockRpc.mockResolvedValue({
      error: null,
      data: [rpcRow, { ...rpcRow, id: 'nix-2', sender_id: 'me-1', receiver_id: 'peer-1', media_type: 'image', status: 'viewed', is_viewed: null }],
    });

    const result = await fetchChatNixesWithPeer('peer-1', 50, 'me-1');

    expect(mockRpc).toHaveBeenCalledWith('get_chat_nixes_with_peer', { p_peer_id: 'peer-1', p_limit: 50 });
    expect(mockNixesSelect).not.toHaveBeenCalled();
    expect(result.map((nix) => [nix.id, nix.direction, nix.is_viewed])).toEqual([
      ['nix-1', 'received', false],
      ['nix-2', 'sent', true],
    ]);
    expect(result[0]).toMatchObject({ media_type: 'video', thumbnail_b64: null, view_duration_sec: 15, playback_duration_ms: 3000 });
  });

  it('clamps the page limit like the legacy query', async () => {
    mockRpc.mockResolvedValue({ error: null, data: [] });

    await fetchChatNixesWithPeer('peer-1', 500, 'me-1');

    expect(mockRpc).toHaveBeenCalledWith('get_chat_nixes_with_peer', { p_peer_id: 'peer-1', p_limit: 100 });
  });

  it.each([
    { code: 'PGRST202', message: 'Could not find the function public.get_chat_nixes_with_peer(p_limit, p_peer_id) in the schema cache' },
    { code: '42883', message: 'function public.get_chat_nixes_with_peer(uuid, integer) does not exist' },
  ])('falls back to the legacy query once the RPC is missing ($code) and remembers it', async (error) => {
    mockRpc.mockResolvedValue({ error, data: null });
    const first = mockLegacyChatSelect([rpcRow]);

    const result = await fetchChatNixesWithPeer('peer-1', 50, 'me-1');

    expect(first.or).toHaveBeenCalledWith(
      'and(sender_id.eq.me-1,receiver_id.eq.peer-1),and(sender_id.eq.peer-1,receiver_id.eq.me-1)'
    );
    expect(first.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(first.limit).toHaveBeenCalledWith(50);
    expect(result).toHaveLength(1);
    expect(result[0].direction).toBe('received');

    mockLegacyChatSelect([]);
    await fetchChatNixesWithPeer('peer-1', 50, 'me-1');
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockNixesSelect).toHaveBeenCalledTimes(2);
  });

  it('throws other RPC errors instead of falling back', async () => {
    mockRpc.mockResolvedValue({ error: { code: '57014', message: 'canceling statement due to statement timeout' }, data: null });

    await expect(fetchChatNixesWithPeer('peer-1', 50, 'me-1')).rejects.toThrow('statement timeout');
    expect(mockNixesSelect).not.toHaveBeenCalled();
  });

  it('returns nothing without a user or peer', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await expect(fetchChatNixesWithPeer('peer-1')).resolves.toEqual([]);
    await expect(fetchChatNixesWithPeer('', 50, 'me-1')).resolves.toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
