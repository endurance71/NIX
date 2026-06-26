import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelOutgoingFriendRequest,
  getFriendInviteRelationStatus,
  listOutgoingFriendRequests,
  normalizeUsername,
  previewProfileQr,
  removeFriend,
  redeemFriendInviteToken,
  sendFriendRequestByProfileQr,
  sendFriendRequest,
} from './friendService';

const {
  mockGetCurrentUser,
  mockFriendshipsSelect,
  mockFriendshipsInsert,
  mockFriendshipsUpdateEq,
  mockFriendshipsUpdate,
  mockSupabaseRpc,
  mockFriendshipsDelete,
  mockFriendshipsDeleteEq,
  mockFriendshipsDeleteOr,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockFriendshipsSelect: vi.fn(),
  mockFriendshipsInsert: vi.fn(),
  mockFriendshipsUpdateEq: vi.fn(),
  mockSupabaseRpc: vi.fn(),
  mockFriendshipsDeleteEq: vi.fn(),
  mockFriendshipsDeleteOr: vi.fn(),
  mockFriendshipsDelete: vi.fn(() => ({
    eq: mockFriendshipsDeleteEq,
    or: mockFriendshipsDeleteOr,
  })),
  mockFriendshipsUpdate: vi.fn(() => ({
    eq: mockFriendshipsUpdateEq,
  })),
}));

vi.mock('./profileService', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: mockSupabaseRpc,
    from: () => ({
      select: mockFriendshipsSelect,
      insert: mockFriendshipsInsert,
      update: mockFriendshipsUpdate,
      delete: mockFriendshipsDelete,
    }),
  },
}));

function buildFriendshipSelectMock(data: unknown) {
  return {
    or: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

describe('friendService helpers', () => {
  it('normalizuje nazwę użytkownika do formatu systemowego', () => {
    expect(normalizeUsername(' @Te_st-User ')).toBe('te_stuser');
  });
});

describe('sendFriendRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFriendshipsUpdateEq.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockFriendshipsDeleteEq.mockReturnValue({ or: mockFriendshipsDeleteOr });
    mockFriendshipsDeleteOr.mockResolvedValue({ error: null });
    mockSupabaseRpc.mockReset();
  });

  it('blokuje self-invite', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });

    await expect(sendFriendRequest('user-1')).rejects.toThrow('Nie możesz dodać siebie');
  });

  it('zwraca already_requested gdy zaproszenie już wysłane', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockFriendshipsSelect.mockReturnValue(
      buildFriendshipSelectMock([
        { id: 'r1', user_id: 'user-1', friend_id: 'user-2', status: 'pending' },
      ])
    );

    const result = await sendFriendRequest('user-2');
    expect(result).toBe('already_requested');
    expect(mockFriendshipsInsert).not.toHaveBeenCalled();
  });

  it('akceptuje odwrócone zaproszenie zamiast dodawać nowe', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockFriendshipsSelect.mockReturnValue(
      buildFriendshipSelectMock([
        { id: 'r1', user_id: 'user-2', friend_id: 'user-1', status: 'pending' },
      ])
    );

    const result = await sendFriendRequest('user-2');
    expect(result).toBe('accepted_reverse_request');
    expect(mockFriendshipsUpdate).toHaveBeenCalledWith({ status: 'accepted' });
  });
});

describe('removeFriend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFriendshipsDeleteEq.mockReturnValue({ or: mockFriendshipsDeleteOr });
    mockFriendshipsDeleteOr.mockResolvedValue({ error: null });
  });

  it('usuwa zaakceptowaną relację znajomości w obu kierunkach', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });

    await removeFriend('user-2');

    expect(mockFriendshipsDelete).toHaveBeenCalled();
    expect(mockFriendshipsDeleteEq).toHaveBeenCalledWith('status', 'accepted');
    expect(mockFriendshipsDeleteOr).toHaveBeenCalledWith(
      'and(user_id.eq.user-1,friend_id.eq.user-2),and(user_id.eq.user-2,friend_id.eq.user-1)'
    );
  });
});

describe('invite token flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mapuje invalid_or_expired gdy redeem zwraca błąd ważności', async () => {
    mockSupabaseRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Invite token expired, invalid, or already used' },
    });

    const result = await redeemFriendInviteToken('token-1234567890');
    expect(result.result).toBe('invalid_or_expired');
  });

  it('zwraca profil zapraszającego po udanym redeem', async () => {
    mockSupabaseRpc
      .mockResolvedValueOnce({
        data: [{ result: 'request_sent', friend_id: 'friend-1' }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'friend-1', username: 'nix_friend' }],
        error: null,
      });

    const result = await redeemFriendInviteToken('token-1234567890');
    expect(result.result).toBe('request_sent');
    expect(result.inviterProfile?.username).toBe('nix_friend');
  });
});

describe('profile QR flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('previewProfileQr zwraca own_profile dla własnego ID', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'me' });

    const result = await previewProfileQr('me');
    expect(result.status).toBe('own_profile');
    expect(result.profile).toBeNull();
  });

  it('previewProfileQr zwraca profil dla poprawnego profileId', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'me' });
    mockSupabaseRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'friend-1',
          username: 'friend_user',
          avatar_storage_path: 'friend-1/avatar.jpg',
          avatar_emoji: null,
        },
      ],
      error: null,
    });

    const result = await previewProfileQr('friend-1');
    expect(result.status).toBe('ok');
    expect(result.profile?.username).toBe('friend_user');
    expect(result.profile?.avatar_storage_path).toBe('friend-1/avatar.jpg');
  });

  it('sendFriendRequestByProfileQr wysyła zaproszenie na podstawie profileId', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'me' });
    mockSupabaseRpc.mockResolvedValueOnce({
      data: [{ id: 'friend-1', username: 'friend_user' }],
      error: null,
    });
    mockFriendshipsSelect.mockReturnValue(buildFriendshipSelectMock([]));
    mockFriendshipsInsert.mockResolvedValue({ error: null });

    const result = await sendFriendRequestByProfileQr('friend-1');
    expect(result.result).toBe('request_sent');
    expect(result.profile?.username).toBe('friend_user');
  });

  it('getFriendInviteRelationStatus zwraca already_friends gdy relacja zaakceptowana', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockFriendshipsSelect.mockReturnValue(
      buildFriendshipSelectMock([{ id: 'r1', user_id: 'user-1', friend_id: 'user-2', status: 'accepted' }])
    );

    const status = await getFriendInviteRelationStatus('user-2');
    expect(status).toBe('already_friends');
  });

  it('getFriendInviteRelationStatus zwraca outgoing_pending gdy wysłano zaproszenie', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockFriendshipsSelect.mockReturnValue(
      buildFriendshipSelectMock([{ id: 'r1', user_id: 'user-1', friend_id: 'user-2', status: 'pending' }])
    );

    const status = await getFriendInviteRelationStatus('user-2');
    expect(status).toBe('outgoing_pending');
  });

  it('getFriendInviteRelationStatus zwraca incoming_pending gdy druga strona zaprosiła', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockFriendshipsSelect.mockReturnValue(
      buildFriendshipSelectMock([{ id: 'r1', user_id: 'user-2', friend_id: 'user-1', status: 'pending' }])
    );

    const status = await getFriendInviteRelationStatus('user-2');
    expect(status).toBe('incoming_pending');
  });
});

describe('outgoing requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('zwraca pustą listę gdy brak sesji', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await listOutgoingFriendRequests();
    expect(result).toEqual([]);
  });

  it('mapuje pending wysłane zaproszenia do profili odbiorców', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    const orderMock = vi.fn().mockResolvedValue({
      data: [{ id: 'req-1', friend_id: 'user-2', created_at: '2026-05-07T08:00:00.000Z' }],
      error: null,
    });
    const eqStatusMock = vi.fn().mockReturnValue({ order: orderMock });
    const eqUserMock = vi.fn().mockReturnValue({ eq: eqStatusMock });
    mockFriendshipsSelect.mockReturnValue({ eq: eqUserMock });
    mockSupabaseRpc.mockResolvedValueOnce({
      data: [{ id: 'user-2', username: 'friend_user', avatar_storage_path: null, avatar_emoji: null }],
      error: null,
    });

    const result = await listOutgoingFriendRequests();

    expect(eqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
    expect(eqStatusMock).toHaveBeenCalledWith('status', 'pending');
    expect(result).toEqual([
      {
        id: 'req-1',
        created_at: '2026-05-07T08:00:00.000Z',
        recipient: {
          id: 'user-2',
          username: 'friend_user',
          avatar_storage_path: null,
          avatar_emoji: null,
        },
      },
    ]);
  });

  it('usuwa wysłane zaproszenie dla zalogowanego użytkownika', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    const eqUserMock = vi.fn().mockResolvedValue({ error: null });
    const eqIdMock = vi.fn().mockReturnValue({ eq: eqUserMock });
    const orMock = vi.fn();
    mockFriendshipsDelete.mockReturnValue({ eq: eqIdMock, or: orMock });

    await cancelOutgoingFriendRequest('req-1');

    expect(eqIdMock).toHaveBeenCalledWith('id', 'req-1');
    expect(eqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
  });
});
