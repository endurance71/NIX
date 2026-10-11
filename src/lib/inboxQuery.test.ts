import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  countUnreadInboxNixes,
  markInboxNixUnplayableInCache,
  markInboxNixViewedInCache,
  type InboxBundle,
  fetchInboxNixesBundle,
  resetInboxBundleRpcFallback,
} from './inboxQuery';
import { queryKeys } from './queryKeys';
import {
  mapInboxNixRow,
  mapSentNixRow,
  type InboxBundleRpcPayload,
} from '../services/nixService';
import { mapRecentTextMessageRow } from '../services/textMessageService';

const {
  mockFetchInbox,
  mockFetchProfiles,
  mockFetchSent,
  mockFetchRecentTextMessages,
  mockListReadStates,
  mockGetUnreadCount,
  mockFetchInboxBundleRpc,
  mockTrackEvent,
} = vi.hoisted(() => ({
  mockFetchInboxBundleRpc: vi.fn(),
  mockTrackEvent: vi.fn(),
  mockFetchInbox: vi.fn(),
  mockFetchProfiles: vi.fn(),
  mockFetchSent: vi.fn(),
  mockFetchRecentTextMessages: vi.fn(),
  mockListReadStates: vi.fn(),
  mockGetUnreadCount: vi.fn(),
}));

// Network-facing service calls are mocked; the pure row mappers stay real so both inbox paths
// are checked against the production mapping.
vi.mock('./supabase', () => ({ supabase: {}, captureAccountTransport: vi.fn() }));
vi.mock('./encryptedPhotoCache', () => ({ encryptedPhotoCache: { remove: vi.fn() } }));
vi.mock('../services/photoCacheService', () => ({ retainPrivatePhotoForReplay: vi.fn() }));
vi.mock('../services/profileService', () => ({ getCurrentUser: vi.fn() }));
vi.mock('./telemetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./telemetry')>()),
  trackEvent: mockTrackEvent,
}));

vi.mock('../services/nixService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/nixService')>()),
  fetchInboxBundleRpc: mockFetchInboxBundleRpc,
  fetchInboxNixes: mockFetchInbox,
  fetchNixPublicProfiles: mockFetchProfiles,
  fetchSentNixes: mockFetchSent,
}));

vi.mock('../services/textMessageService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/textMessageService')>()),
  fetchRecentTextMessagesForInbox: mockFetchRecentTextMessages,
}));

vi.mock('../services/conversationReadService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/conversationReadService')>()),
  listConversationReadStates: mockListReadStates,
  getUnreadInboxCount: mockGetUnreadCount,
}));

function bundle(): InboxBundle {
  return {
    inboxData: [
      { id: 'unread', is_viewed: false, status: 'sent' },
      { id: 'read', is_viewed: true, status: 'viewed' },
    ] as InboxBundle['inboxData'],
    sentData: [],
    textMessagesData: [],
    unreadCount: 1,
  };
}

describe('inbox query cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetInboxBundleRpcFallback();
    // Existing cases exercise the multi-query path (RPC not deployed yet).
    mockFetchInboxBundleRpc.mockResolvedValue(null);
    mockFetchRecentTextMessages.mockResolvedValue([]);
    mockListReadStates.mockResolvedValue(new Map());
    mockGetUnreadCount.mockResolvedValue(0);
  });

  it('pobiera profile rozmówców jednym wspólnym wywołaniem', async () => {
    mockFetchInbox.mockResolvedValue([
      { id: 'incoming', sender_id: 'sender-1', sender: null },
    ]);
    mockFetchSent.mockResolvedValue([
      { id: 'outgoing', receiver_id: 'receiver-1', receiver: null },
    ]);
    mockFetchRecentTextMessages.mockResolvedValue([]);
    mockFetchProfiles.mockResolvedValue(
      new Map([
        ['sender-1', { id: 'sender-1', username: 'sender', display_name: 'Nadawca Nazwa' }],
        ['receiver-1', { id: 'receiver-1', username: 'receiver', display_name: 'Odbiorca Nazwa' }],
      ])
    );

    const result = await fetchInboxNixesBundle();

    expect(mockFetchInbox).toHaveBeenCalledWith({ includeProfiles: false });
    expect(mockFetchSent).toHaveBeenCalledWith({ includeProfiles: false });
    expect(mockFetchProfiles).toHaveBeenCalledTimes(1);
    expect(mockFetchProfiles).toHaveBeenCalledWith(['sender-1', 'receiver-1']);
    expect(result.inboxData[0].sender?.username).toBe('sender');
    expect(result.inboxData[0].sender?.display_name).toBe('Nadawca Nazwa');
    expect(result.sentData[0].receiver?.username).toBe('receiver');
    expect(result.sentData[0].receiver?.display_name).toBe('Odbiorca Nazwa');
  });

  it('wylicza badge bez osobnego zapytania', () => {
    expect(countUnreadInboxNixes(bundle())).toBe(1);
    expect(countUnreadInboxNixes(undefined)).toBe(0);
  });

  it('oznacza jako unread tylko odebraną wiadomość po prywatnym last_read_at', async () => {
    mockFetchInbox.mockResolvedValue([]);
    mockFetchSent.mockResolvedValue([]);
    mockFetchRecentTextMessages.mockResolvedValue([
      {
        id: 'incoming-text',
        peer_id: 'peer-1',
        sender_id: 'peer-1',
        receiver_id: 'current-user',
        body: 'hello',
        created_at: '2026-07-29T10:00:00.000Z',
        expires_at: '2026-07-30T10:00:00.000Z',
      },
      {
        id: 'outgoing-text',
        peer_id: 'peer-2',
        sender_id: 'current-user',
        receiver_id: 'peer-2',
        body: 'hello',
        created_at: '2026-07-29T10:00:00.000Z',
        expires_at: '2026-07-30T10:00:00.000Z',
      },
    ]);
    mockListReadStates.mockResolvedValue(
      new Map([['peer-1', '2026-07-29T09:00:00.000Z']])
    );
    mockFetchProfiles.mockResolvedValue(
      new Map([
        ['peer-1', { username: 'one' }],
        ['peer-2', { username: 'two' }],
      ])
    );

    const result = await fetchInboxNixesBundle();

    expect(result.textMessagesData[0].is_unread).toBe(true);
    expect(result.textMessagesData[1].is_unread).toBe(false);
  });

  it('optymistycznie oznacza NiX jako odczytany', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.inboxNixesBundle, bundle());

    markInboxNixViewedInCache(queryClient, 'unread', '2026-07-14T10:00:00.000Z');

    const cached = queryClient.getQueryData<InboxBundle>(queryKeys.inboxNixesBundle);
    expect(countUnreadInboxNixes(cached)).toBe(0);
    expect(cached?.inboxData[0]).toMatchObject({
      id: 'unread',
      is_viewed: true,
      status: 'viewed',
      viewed_at: '2026-07-14T10:00:00.000Z',
    });
  });

  it('optymistycznie oznacza nieodtwarzalny NiX jako cleaned bez replay', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.inboxNixesBundle, bundle());

    markInboxNixUnplayableInCache(queryClient, 'unread', '2026-07-14T10:00:00.000Z');

    const cached = queryClient.getQueryData<InboxBundle>(queryKeys.inboxNixesBundle);
    expect(countUnreadInboxNixes(cached)).toBe(0);
    expect(cached?.inboxData[0]).toMatchObject({
      id: 'unread',
      is_viewed: true,
      is_replayed: true,
      status: 'cleaned',
      replay_expires_at: null,
      viewed_at: '2026-07-14T10:00:00.000Z',
    });
  });
});

const ME = 'me-1';

function rpcPayload(): InboxBundleRpcPayload {
  return {
    inbox: [
      {
        id: 'in-1',
        sender_id: 'friend-1',
        media_path: 'nixes/friend-1/a.jpg',
        media_type: 'image',
        playback_duration_ms: null,
        created_at: '2026-10-10T10:05:00.000000+00:00',
        is_viewed: false,
        status: 'sent',
        view_duration_sec: 5,
      },
      {
        id: 'in-2',
        sender_id: 'banned-1',
        media_path: 'nixes/banned-1/b.mp4',
        media_type: null,
        playback_duration_ms: 4200,
        created_at: '2026-10-10T10:04:00.000000+00:00',
        is_viewed: true,
        status: 'viewed',
        view_duration_sec: null,
      },
    ],
    sent: [
      {
        id: 'out-1',
        receiver_id: 'friend-1',
        created_at: '2026-10-10T10:03:00.000000+00:00',
        status: 'sent',
        viewed_at: null,
        cleaned_at: null,
        client_upload_id: 'upload-1',
      },
    ],
    texts: [
      {
        id: 'text-in',
        sender_id: 'friend-1',
        receiver_id: ME,
        body: 'hej',
        created_at: '2026-10-10T10:02:00.000000+00:00',
        expires_at: '2026-10-11T10:02:00.000000+00:00',
        client_message_id: null,
        is_system: false,
        metadata: { kind: 'x' },
        peer_id: 'friend-1',
      },
      {
        id: 'text-out',
        sender_id: ME,
        receiver_id: 'friend-2',
        body: 'czesc',
        created_at: '2026-10-10T10:01:00.000000+00:00',
        expires_at: '2026-10-11T10:01:00.000000+00:00',
        client_message_id: 'client-1',
        is_system: false,
        metadata: ['not', 'an', 'object'],
        peer_id: 'friend-2',
      },
    ],
    read_states: [{ peer_id: 'friend-1', last_read_at: '2026-10-10T10:00:00.000000+00:00' }],
    profiles: [
      { id: 'friend-1', username: 'friend_one', display_name: 'Friend One', avatar_emoji: '🦊' },
      { id: 'friend-2', username: 'friend_two', avatar_storage_path: 'avatars/2.jpg' },
    ],
    unread_count: 3,
  };
}

/** Feeds the same rows to the multi-query mocks, mapped exactly like the real services do. */
function mockMultiQueryFrom(payload: InboxBundleRpcPayload) {
  mockFetchInbox.mockResolvedValue(payload.inbox.map((row) => mapInboxNixRow(row)));
  mockFetchSent.mockResolvedValue(payload.sent.map((row) => mapSentNixRow(row)));
  mockFetchRecentTextMessages.mockResolvedValue(
    payload.texts.map((row) => {
      const { peer_id, ...columns } = row as Parameters<typeof mapRecentTextMessageRow>[0] & {
        peer_id: string;
      };
      return mapRecentTextMessageRow(columns, ME);
    })
  );
  mockListReadStates.mockResolvedValue(
    new Map(payload.read_states.map((row) => [row.peer_id, row.last_read_at]))
  );
  mockGetUnreadCount.mockResolvedValue(payload.unread_count);
  mockFetchProfiles.mockResolvedValue(new Map(payload.profiles.map((p) => [p.id, p])));
}

describe('inbox bundle RPC (get_inbox_bundle)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetInboxBundleRpcFallback();
  });

  it('builds the whole bundle from one RPC without the multi-query path', async () => {
    mockFetchInboxBundleRpc.mockResolvedValue(rpcPayload());

    const result = await fetchInboxNixesBundle();

    expect(mockFetchInboxBundleRpc).toHaveBeenCalledTimes(1);
    expect(mockFetchInbox).not.toHaveBeenCalled();
    expect(mockFetchSent).not.toHaveBeenCalled();
    expect(mockFetchRecentTextMessages).not.toHaveBeenCalled();
    expect(mockListReadStates).not.toHaveBeenCalled();
    expect(mockGetUnreadCount).not.toHaveBeenCalled();
    expect(mockFetchProfiles).not.toHaveBeenCalled();

    expect(result.unreadCount).toBe(3);
    expect(result.inboxData[0]).toMatchObject({
      id: 'in-1',
      thumbnail_b64: null,
      sender: {
        username: 'friend_one',
        display_name: 'Friend One',
        avatar_emoji: '🦊',
        avatar_storage_path: null,
      },
    });
    // Peer without a public profile (blocked / restricted) stays anonymous, like today.
    expect(result.inboxData[1]).toMatchObject({
      id: 'in-2',
      media_type: 'image',
      view_duration_sec: 5,
      sender: null,
    });
    expect(result.sentData[0]).toMatchObject({
      id: 'out-1',
      client_upload_id: 'upload-1',
      receiver: { username: 'friend_one' },
    });
    expect(result.textMessagesData[0]).toMatchObject({
      id: 'text-in',
      peer_id: 'friend-1',
      is_unread: true,
      metadata: { kind: 'x' },
      peerProfile: { username: 'friend_one' },
    });
    expect(result.textMessagesData[1]).toMatchObject({
      id: 'text-out',
      peer_id: 'friend-2',
      is_unread: false,
      metadata: null,
      peerProfile: { username: 'friend_two', avatar_storage_path: 'avatars/2.jpg' },
    });
  });

  it('returns exactly the same bundle as the multi-query path for the same rows', async () => {
    const payload = rpcPayload();
    mockFetchInboxBundleRpc.mockResolvedValue(payload);
    const fromRpc = await fetchInboxNixesBundle();

    resetInboxBundleRpcFallback();
    mockFetchInboxBundleRpc.mockResolvedValue(null);
    mockMultiQueryFrom(payload);
    const fromQueries = await fetchInboxNixesBundle();

    expect(mockFetchInbox).toHaveBeenCalledTimes(1);
    expect(fromRpc).toEqual(fromQueries);
  });

  it('clamps the unread badge like get_unread_inbox_count', async () => {
    mockFetchInboxBundleRpc.mockResolvedValue({ ...rpcPayload(), unread_count: 5000 });
    expect((await fetchInboxNixesBundle()).unreadCount).toBe(999);
  });

  it('falls back to the multi-query path when the RPC is not deployed and remembers it', async () => {
    mockFetchInboxBundleRpc.mockResolvedValue(null);
    mockMultiQueryFrom(rpcPayload());

    const first = await fetchInboxNixesBundle();
    const second = await fetchInboxNixesBundle();

    expect(mockFetchInboxBundleRpc).toHaveBeenCalledTimes(1);
    expect(mockFetchInbox).toHaveBeenCalledTimes(2);
    expect(first.inboxData).toHaveLength(2);
    expect(second).toEqual(first);
    expect(mockTrackEvent).toHaveBeenCalledWith('inbox_bundle_rpc_fallback', {
      reason: 'missing_rpc',
    });
  });

  it('surfaces network errors without trying the separate queries', async () => {
    mockFetchInboxBundleRpc.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(fetchInboxNixesBundle()).rejects.toThrow('Network request failed');
    expect(mockFetchInbox).not.toHaveBeenCalled();

    mockFetchInboxBundleRpc.mockResolvedValueOnce(rpcPayload());
    await fetchInboxNixesBundle();
    expect(mockFetchInboxBundleRpc).toHaveBeenCalledTimes(2);
  });

  it('falls back to the separate queries for one fetch when the RPC itself fails', async () => {
    mockFetchInboxBundleRpc.mockRejectedValueOnce(new Error('statement timeout'));

    await fetchInboxNixesBundle();
    expect(mockFetchInbox).toHaveBeenCalledTimes(1);

    // Not remembered: the next fetch uses the RPC again.
    mockFetchInboxBundleRpc.mockResolvedValueOnce(rpcPayload());
    await fetchInboxNixesBundle();
    expect(mockFetchInboxBundleRpc).toHaveBeenCalledTimes(2);
    expect(mockFetchInbox).toHaveBeenCalledTimes(1);
  });
});
