import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  countUnreadInboxNixes,
  markInboxNixViewedInCache,
  type InboxBundle,
  fetchInboxNixesBundle,
} from './inboxQuery';
import { queryKeys } from './queryKeys';

const { mockFetchInbox, mockFetchProfiles, mockFetchSent } = vi.hoisted(() => ({
  mockFetchInbox: vi.fn(),
  mockFetchProfiles: vi.fn(),
  mockFetchSent: vi.fn(),
}));

vi.mock('../services/nixService', () => ({
  fetchInboxNixes: mockFetchInbox,
  fetchNixPublicProfiles: mockFetchProfiles,
  fetchSentNixes: mockFetchSent,
}));

function bundle(): InboxBundle {
  return {
    inboxData: [
      { id: 'unread', is_viewed: false, status: 'sent' },
      { id: 'read', is_viewed: true, status: 'viewed' },
    ] as InboxBundle['inboxData'],
    sentData: [],
  };
}

describe('inbox query cache', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pobiera profile rozmówców jednym wspólnym wywołaniem', async () => {
    mockFetchInbox.mockResolvedValue([
      { id: 'incoming', sender_id: 'sender-1', sender: null },
    ]);
    mockFetchSent.mockResolvedValue([
      { id: 'outgoing', receiver_id: 'receiver-1', receiver: null },
    ]);
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
});
