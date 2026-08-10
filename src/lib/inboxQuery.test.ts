import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  countUnreadInboxNixes,
  markInboxNixUnplayableInCache,
  markInboxNixViewedInCache,
  type InboxBundle,
  fetchInboxNixesBundle,
} from './inboxQuery';
import { queryKeys } from './queryKeys';

const {
  mockFetchInbox,
  mockFetchProfiles,
  mockFetchSent,
  mockFetchRecentTextMessages,
  mockListReadStates,
  mockGetUnreadCount,
} = vi.hoisted(() => ({
  mockFetchInbox: vi.fn(),
  mockFetchProfiles: vi.fn(),
  mockFetchSent: vi.fn(),
  mockFetchRecentTextMessages: vi.fn(),
  mockListReadStates: vi.fn(),
  mockGetUnreadCount: vi.fn(),
}));

vi.mock('../services/nixService', () => ({
  fetchInboxNixes: mockFetchInbox,
  fetchNixPublicProfiles: mockFetchProfiles,
  fetchSentNixes: mockFetchSent,
}));

vi.mock('../services/textMessageService', () => ({
  fetchRecentTextMessagesForInbox: mockFetchRecentTextMessages,
}));

vi.mock('../services/conversationReadService', () => ({
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
