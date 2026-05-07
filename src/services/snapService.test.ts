import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteConversationWithPeer,
  enqueueCleanupJob,
  fetchSentSnaps,
  filterUnreadInboxSnapsFromSender,
  flushCleanupQueue,
  insertSnap,
  markSnapViewedWithCleanup,
  requestSnapCleanup,
  type InboxSnap,
} from './snapService';

const {
  mockGetCurrentUser,
  mockInvoke,
  mockRpc,
  mockSnapsSelectEq,
  mockSnapsSelectOrder,
  mockSnapsSelectLimit,
  mockSnapsSelectEqValue,
  mockSnapsUpdateEq,
  mockSnapsUpsert,
  mockSnapsInsert,
  mockQueueUpsert,
  mockQueueDeleteEq,
  mockQueueDelete,
  mockQueueUpdateEq,
  mockQueueUpdate,
  mockQueueSelectEq,
  mockQueueSelectLte,
  mockQueueSelectOrder,
  mockQueueSelectLimit,
} = vi.hoisted(() => {
  const queueDeleteEq = vi.fn();
  const queueUpdateEq = vi.fn();
  const queueSelectLte = vi.fn();
  const queueSelectOrder = vi.fn();
  const queueSelectLimit = vi.fn();
  const snapsSelectOrder = vi.fn();
  const snapsSelectLimit = vi.fn();
  const snapsSelectEq = vi.fn();

  return {
    mockGetCurrentUser: vi.fn(),
    mockInvoke: vi.fn(),
    mockRpc: vi.fn(),
    mockSnapsSelectEqValue: { order: snapsSelectOrder },
    mockSnapsSelectEq: snapsSelectEq,
    mockSnapsSelectOrder: snapsSelectOrder,
    mockSnapsSelectLimit: snapsSelectLimit,
    mockSnapsUpdateEq: vi.fn(),
    mockSnapsUpsert: vi.fn(),
    mockSnapsInsert: vi.fn(),
    mockQueueUpsert: vi.fn(),
    mockQueueDeleteEq: queueDeleteEq,
    mockQueueDelete: vi.fn(() => ({ eq: queueDeleteEq })),
    mockQueueUpdateEq: queueUpdateEq,
    mockQueueUpdate: vi.fn(() => ({ eq: queueUpdateEq })),
    mockQueueSelectEq: vi.fn(() => ({ lte: queueSelectLte })),
    mockQueueSelectLte: queueSelectLte,
    mockQueueSelectOrder: queueSelectOrder,
    mockQueueSelectLimit: queueSelectLimit,
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
    from: (table: string) => {
      if (table === 'snaps') {
        return {
          update: () => ({ eq: mockSnapsUpdateEq }),
          insert: mockSnapsInsert,
          upsert: mockSnapsUpsert,
          select: () => ({
            eq: mockSnapsSelectEq,
          }),
        };
      }

      if (table === 'snap_cleanup_queue') {
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

function inboxStub(partial: Partial<InboxSnap> & Pick<InboxSnap, 'id' | 'sender_id' | 'created_at'>): InboxSnap {
  return {
    media_path: 'p.jpg',
    is_viewed: false,
    media_type: 'image',
    playback_duration_ms: null,
    view_duration_sec: 5,
    status: 'sent',
    sender: null,
    ...partial,
  };
}

describe('filterUnreadInboxSnapsFromSender', () => {
  it('zwraca tylko nieprzeczytane od danego nadawcy posortowane rosnąco po created_at', () => {
    const sender = 'user-a';
    const snaps: InboxSnap[] = [
      inboxStub({ id: '3', sender_id: sender, created_at: '2026-01-03T00:00:00.000Z' }),
      inboxStub({ id: '1', sender_id: sender, created_at: '2026-01-01T00:00:00.000Z' }),
      inboxStub({ id: '2', sender_id: sender, created_at: '2026-01-02T00:00:00.000Z' }),
      inboxStub({ id: 'x', sender_id: 'other', created_at: '2026-01-01T12:00:00.000Z' }),
      inboxStub({ id: '4', sender_id: sender, created_at: '2026-01-04T00:00:00.000Z', is_viewed: true }),
    ];
    const q = filterUnreadInboxSnapsFromSender(snaps, sender);
    expect(q.map((s) => s.id)).toEqual(['1', '2', '3']);
  });

  it('pomija wpisy z is_viewed wyłącznie przez !== true', () => {
    const sender = 'user-b';
    const snaps: InboxSnap[] = [
      inboxStub({ id: 'a', sender_id: sender, created_at: '2026-01-01T00:00:00.000Z', is_viewed: false as any }),
      inboxStub({
        id: 'b',
        sender_id: sender,
        created_at: '2026-01-02T00:00:00.000Z',
        is_viewed: undefined as unknown as boolean,
      }),
    ];
    const q = filterUnreadInboxSnapsFromSender(snaps, sender);
    expect(q.map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('snapService cleanup flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ id: 'receiver-1' });
    mockSnapsUpdateEq.mockResolvedValue({ error: null });
    mockSnapsSelectEq.mockReturnValue(mockSnapsSelectEqValue);
    mockSnapsSelectOrder.mockReturnValue({ limit: mockSnapsSelectLimit });
    mockSnapsSelectLimit.mockResolvedValue({ error: null, data: [] });
    mockRpc.mockResolvedValue({ error: null, data: [] });
    mockQueueUpsert.mockResolvedValue({ error: null });
    mockQueueDeleteEq.mockResolvedValue({ error: null });
    mockQueueUpdateEq.mockResolvedValue({ error: null });
  });

  it('wywołuje edge cleanup i usuwa job z kolejki', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });

    await markSnapViewedWithCleanup('snap-1', 'snaps/receiver-1/file.jpg');

    expect(mockInvoke).toHaveBeenCalledWith('cleanup-snap', {
      body: { snapId: 'snap-1', mediaPath: 'snaps/receiver-1/file.jpg' },
    });
    expect(mockQueueDeleteEq).toHaveBeenCalledWith('snap_id', 'snap-1');
  });

  it('zapisuje retry gdy cleanup edge nie działa', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('network') });

    // Cleanup failure is non-critical — function resolves but enqueues retry.
    await markSnapViewedWithCleanup('snap-2', 'snaps/receiver-1/file2.jpg');
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
          snap_id: 'snap-queued',
          media_path: 'snaps/receiver-1/queued.jpg',
          receiver_id: 'receiver-1',
          attempt_count: 1,
        },
      ],
    });

    await flushCleanupQueue();

    expect(mockInvoke).toHaveBeenCalledWith('cleanup-snap', {
      body: { snapId: 'snap-queued', mediaPath: 'snaps/receiver-1/queued.jpg' },
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
          snap_id: 'snap-retry',
          media_path: 'snaps/receiver-1/retry.jpg',
          receiver_id: 'receiver-1',
          attempt_count: 2,
        },
      ],
    });

    await flushCleanupQueue();

    expect(mockQueueUpdate).toHaveBeenCalled();
    expect(mockQueueUpdateEq).toHaveBeenCalledWith('snap_id', 'snap-retry');
  });

  it('enqueueCleanupJob dodaje pozycję do kolejki', async () => {
    await enqueueCleanupJob('snap-3', 'snaps/receiver-1/queued2.jpg');
    expect(mockQueueUpsert).toHaveBeenCalled();
  });

  it('requestSnapCleanup zgłasza błąd dla niepoprawnej odpowiedzi', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: false }, error: null });
    await expect(requestSnapCleanup('snap-4', 'snaps/receiver-1/a.jpg')).rejects.toThrow();
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

  it('insertSnap zapisuje thumbnail_b64 dla wideo', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'sender-1' });
    mockSnapsUpsert.mockResolvedValue({ error: null });

    await insertSnap('receiver-1', 'snaps/sender-1/v.mp4', 15, {
      mediaType: 'video',
      playbackDurationMs: 12_000,
      clientUploadId: 'abc',
      thumbnailB64: 'data:image/jpeg;base64,Zm9v',
    });

    expect(mockSnapsUpsert).toHaveBeenCalledTimes(1);
    const [payload, opts] = mockSnapsUpsert.mock.calls[0];
    expect(payload.media_type).toBe('video');
    expect(payload.thumbnail_b64).toBe('data:image/jpeg;base64,Zm9v');
    expect(payload.playback_duration_ms).toBe(12_000);
    expect(opts).toMatchObject({ onConflict: 'sender_id,receiver_id,client_upload_id' });
  });

  it('insertSnap retry-uje bez thumbnail_b64, gdy kolumna nie istnieje', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'sender-1' });
    mockSnapsUpsert
      .mockResolvedValueOnce({
        error: { message: "Could not find the 'thumbnail_b64' column of 'snaps'" },
      })
      .mockResolvedValueOnce({ error: null });

    await insertSnap('receiver-1', 'snaps/sender-1/v2.mp4', 5, {
      mediaType: 'video',
      playbackDurationMs: 8_000,
      clientUploadId: 'def',
      thumbnailB64: 'data:image/jpeg;base64,Zm9v',
    });

    expect(mockSnapsUpsert).toHaveBeenCalledTimes(2);
    const [retryPayload] = mockSnapsUpsert.mock.calls[1];
    expect('thumbnail_b64' in retryPayload).toBe(false);
    expect(retryPayload.media_type).toBe('video');
  });

  it('insertSnap pomija thumbnail_b64 dla obrazków', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'sender-1' });
    mockSnapsUpsert.mockResolvedValue({ error: null });

    await insertSnap('receiver-1', 'snaps/sender-1/img.jpg', 5, {
      mediaType: 'image',
      clientUploadId: 'img-1',
      // Wartość niedozwolona dla obrazów — powinna zostać zignorowana.
      thumbnailB64: 'data:image/jpeg;base64,XXX',
    });

    expect(mockSnapsUpsert).toHaveBeenCalledTimes(1);
    const [payload] = mockSnapsUpsert.mock.calls[0];
    expect('thumbnail_b64' in payload).toBe(false);
  });

  it('fetchSentSnaps zwraca historię wysłanych z mapowaniem odbiorcy', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'sender-1' });
    mockSnapsSelectEq.mockReturnValue({ order: mockSnapsSelectOrder });
    mockSnapsSelectOrder.mockReturnValue({ limit: mockSnapsSelectLimit });
    mockSnapsSelectLimit.mockResolvedValue({
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

    const result = await fetchSentSnaps();

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
    expect(mockSnapsSelectEq).toHaveBeenCalledWith('sender_id', 'sender-1');
    expect(mockRpc).toHaveBeenCalledWith('get_public_profiles_by_ids', {
      profile_ids: ['friend-1'],
    });
  });
});
