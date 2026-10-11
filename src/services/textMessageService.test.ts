import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSessionOwner } from '../lib/sessionScope';
import {
  sendTextMessage,
  fetchTextMessagesWithPeer,
  deleteTextMessageConversation,
  fetchRecentTextMessagesForInbox,
  fetchRecentTextMessagesWithPeer,
  mapRecentTextMessageRow,
  mapRecentTextMessageRpcRow,
  cancelOwnTextMessage,
  isMissingNixReplySupportError,
} from './textMessageService';

const {
  mockGetCurrentUser,
  mockSupabaseRpc,
  mockInsert,
  mockInsertSelectSingle,
  mockSelectOrGtOrderLimit,
  mockSelectMaybeSingle,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockSupabaseRpc: vi.fn(),
  mockInsert: vi.fn(),
  mockInsertSelectSingle: vi.fn(),
  mockSelectOrGtOrderLimit: vi.fn(),
  mockSelectMaybeSingle: vi.fn(),
}));

vi.mock('./profileService', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock('../lib/supabase', async () => {
  const { captureSessionScope } = await import('../lib/sessionScope');
  const client = {
    rpc: mockSupabaseRpc,
    from: (table: string) => {
      if (table === 'text_messages') {
        const eqChain = {
          eq: () => eqChain,
          maybeSingle: mockSelectMaybeSingle,
        };
        return {
          insert: mockInsert,
          select: () => ({
            eq: () => eqChain,
            or: () => ({
              gt: () => ({
                order: () => ({
                  limit: mockSelectOrGtOrderLimit,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  };
  return { supabase: client, captureAccountTransport: async () => {
    const user = await mockGetCurrentUser();
    if (!user) throw new Error('Wymagane logowanie.');
    return { ...captureSessionScope(user.id), client };
  } };
});

describe('textMessageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSessionOwner('user-123');
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123', email: 'test@example.com' });
  });

  describe('sendTextMessage', () => {
    beforeEach(() => {
      mockInsert.mockReturnValue({
        select: () => ({
          single: mockInsertSelectSingle,
        }),
      });
      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: { code: 'P0001', message: 'MODERATION_DISABLED' },
      });
    });

    it('rzuca błąd gdy treść jest pusta', async () => {
      await expect(
        sendTextMessage({ receiverId: 'peer-456', body: '   ' })
      ).rejects.toThrow('Wiadomość nie może być pusta');
      expect(mockSupabaseRpc).not.toHaveBeenCalled();
    });

    it('aborts a paused MODERATION_DISABLED request before insert after an account switch', async () => {
      let release!: (result: unknown) => void;
      mockSupabaseRpc.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
      const send = sendTextMessage({ receiverId: 'peer-456', body: 'private A' });
      const cancelled = expect(send).rejects.toMatchObject({ name: 'AbortError' });
      await vi.waitFor(() => expect(release).toBeDefined());
      setSessionOwner('user-b');
      release({ data: null, error: { message: 'MODERATION_DISABLED' } });
      await cancelled;
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('cancels moderation polling immediately after logout', async () => {
      mockSupabaseRpc.mockResolvedValueOnce({ data: { status: 'pending', jobId: 'job-a' }, error: null })
        .mockResolvedValueOnce({ data: { status: 'pending' }, error: null });
      const send = sendTextMessage({ receiverId: 'peer-456', body: 'private A' });
      const cancelled = expect(send).rejects.toMatchObject({ name: 'AbortError' });
      await vi.waitFor(() => expect(mockSupabaseRpc).toHaveBeenCalledTimes(2));
      setSessionOwner(null); await cancelled;
      expect(mockSupabaseRpc).toHaveBeenCalledTimes(2);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('rzuca błąd gdy treść przekracza 2000 znaków', async () => {
      const longBody = 'a'.repeat(2001);
      await expect(
        sendTextMessage({ receiverId: 'peer-456', body: longBody })
      ).rejects.toThrow('Wiadomość przekracza limit 2000 znaków');
      expect(mockSupabaseRpc).not.toHaveBeenCalled();
    });

    it('przy MODERATION_DISABLED woła enqueue i wpada na INSERT', async () => {
      const mockResult = {
        id: 'msg-1',
        sender_id: 'user-123',
        receiver_id: 'peer-456',
        body: 'Cześć!',
        created_at: '2026-07-24T12:00:00Z',
        expires_at: '2026-07-25T12:00:00Z',
        client_message_id: 'client-1',
      };
      mockInsertSelectSingle.mockResolvedValue({ data: mockResult, error: null });

      const result = await sendTextMessage({
        receiverId: 'peer-456',
        body: 'Cześć!',
        clientMessageId: 'client-1',
      });

      expect(mockSupabaseRpc).toHaveBeenCalledWith('enqueue_own_text_moderation_job', {
        p_receiver_id: 'peer-456',
        p_body: 'Cześć!',
        p_client_message_id: 'client-1',
      });
      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual({ ...mockResult, metadata: null });
    });

    describe('reply to a NiX (20261013100000)', () => {
      // The fallback gate is module state with a 10 min cooldown: each test runs an hour later.
      let clock = Date.parse('2026-10-13T08:00:00Z');
      beforeEach(() => {
        clock += 60 * 60_000;
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(clock);
        mockInsertSelectSingle.mockResolvedValue({
          data: { id: 'msg-r', sender_id: 'user-123', receiver_id: 'peer-456', body: 'Super', metadata: null },
          error: null,
        });
      });
      afterEach(() => {
        vi.useRealTimers();
      });

      it('sends the NiX id with the enqueue RPC and the direct insert', async () => {
        await sendTextMessage({ receiverId: 'peer-456', body: 'Super', clientMessageId: 'c-1', replyToNixId: 'nix-1' });
        expect(mockSupabaseRpc).toHaveBeenCalledWith('enqueue_own_text_moderation_job', {
          p_receiver_id: 'peer-456',
          p_body: 'Super',
          p_client_message_id: 'c-1',
          p_reply_to_nix_id: 'nix-1',
        });
        expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ reply_to_nix_id: 'nix-1' }));
      });

      it('retries the enqueue without the parameter on a backend without the migration', async () => {
        mockSupabaseRpc
          .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
          .mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'MODERATION_DISABLED' } });
        await sendTextMessage({ receiverId: 'peer-456', body: 'Super', clientMessageId: 'c-2', replyToNixId: 'nix-1' });
        expect(mockSupabaseRpc).toHaveBeenLastCalledWith('enqueue_own_text_moderation_job', {
          p_receiver_id: 'peer-456',
          p_body: 'Super',
          p_client_message_id: 'c-2',
        });
        // Remembered: the insert and the next send skip the reply column / parameter.
        expect(mockInsert.mock.calls[0][0].reply_to_nix_id).toBeUndefined();
        mockSupabaseRpc.mockClear();
        await sendTextMessage({ receiverId: 'peer-456', body: 'Again', replyToNixId: 'nix-1' });
        expect(mockSupabaseRpc).toHaveBeenCalledTimes(1);
        expect(mockSupabaseRpc.mock.calls[0][1]).not.toHaveProperty('p_reply_to_nix_id');
      });

      it('retries the direct insert without the column when PostgREST does not know it', async () => {
        mockInsertSelectSingle.mockResolvedValueOnce({
          data: null,
          error: { code: 'PGRST204', message: "Could not find the 'reply_to_nix_id' column of 'text_messages'" },
        });
        const result = await sendTextMessage({ receiverId: 'peer-456', body: 'Super', replyToNixId: 'nix-1' });
        expect(mockInsert).toHaveBeenCalledTimes(2);
        expect(mockInsert.mock.calls[1][0].reply_to_nix_id).toBeUndefined();
        expect(result.id).toBe('msg-r');
      });
    });

    it('isMissingNixReplySupportError only matches a missing parameter or reply column', () => {
      expect(isMissingNixReplySupportError({ code: 'PGRST202', message: 'x' })).toBe(true);
      expect(isMissingNixReplySupportError({ code: 'PGRST204', message: "'reply_to_nix_id' column" })).toBe(true);
      expect(isMissingNixReplySupportError({ code: 'PGRST204', message: "'other' column" })).toBe(false);
      expect(isMissingNixReplySupportError({ code: 'P0001', message: 'NOT_FRIEND' })).toBe(false);
      expect(isMissingNixReplySupportError(null)).toBe(false);
    });

    it('mapuje naruszenie filtra na CONTENT_NOT_ALLOWED bez treści wiadomości', async () => {
      mockInsertSelectSingle.mockResolvedValue({
        data: null,
        error: {
          code: '23514',
          message: 'new row for relation "text_messages" violates check constraint "text_messages_safety_filter_chk"',
        },
      });

      await expect(
        sendTextMessage({ receiverId: 'peer-456', body: 'blokowana-tresc-testowa' })
      ).rejects.toMatchObject({
        code: 'CONTENT_NOT_ALLOWED',
        message: 'Ta wiadomość nie może zostać wysłana.',
      });
    });

    it('nie traktuje innych CHECK 23514 jako moderacji', async () => {
      mockInsertSelectSingle.mockResolvedValue({
        data: null,
        error: {
          code: '23514',
          message: 'new row for relation "text_messages" violates check constraint "check_sender_neq_receiver"',
        },
      });

      await expect(
        sendTextMessage({ receiverId: 'user-123', body: 'Cześć' })
      ).rejects.toMatchObject({
        code: 'UNKNOWN',
      });
    });

    it('NOT_FRIEND z RPC nie robi INSERT', async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: { code: 'P0001', message: 'NOT_FRIEND' },
      });

      await expect(
        sendTextMessage({ receiverId: 'peer-456', body: 'Cześć' })
      ).rejects.toMatchObject({ code: 'NOT_FRIEND' });
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('CONTENT_NOT_ALLOWED z RPC nie robi INSERT', async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: { code: 'P0001', message: 'CONTENT_NOT_ALLOWED' },
      });

      await expect(
        sendTextMessage({ receiverId: 'peer-456', body: 'Cześć' })
      ).rejects.toMatchObject({ code: 'CONTENT_NOT_ALLOWED' });
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('pending z RPC czeka na approved i nie robi INSERT', async () => {
      const mockResult = {
        id: 'msg-1',
        sender_id: 'user-123',
        receiver_id: 'peer-456',
        body: 'Cześć',
        created_at: '2026-07-24T12:00:00Z',
        expires_at: '2026-07-25T12:00:00Z',
        client_message_id: 'client-1',
      };
      mockSupabaseRpc.mockImplementation(async (name: string) => {
        if (name === 'enqueue_own_text_moderation_job') {
          return { data: { jobId: 'job-1', status: 'pending' }, error: null };
        }
        if (name === 'get_own_text_moderation_job') {
          return {
            data: { jobId: 'job-1', status: 'approved', messageId: 'msg-1' },
            error: null,
          };
        }
        return { data: null, error: { message: `unexpected rpc ${name}` } };
      });
      mockSelectMaybeSingle.mockResolvedValue({ data: mockResult, error: null });

      const result = await sendTextMessage({ receiverId: 'peer-456', body: 'Cześć' });

      expect(mockSupabaseRpc).toHaveBeenCalledWith('get_own_text_moderation_job', {
        p_job_id: 'job-1',
      });
      expect(mockInsert).not.toHaveBeenCalled();
      expect(result).toEqual({ ...mockResult, metadata: null });
    });

    it('rejected z polla mapuje na CONTENT_NOT_ALLOWED bez INSERT', async () => {
      mockSupabaseRpc.mockImplementation(async (name: string) => {
        if (name === 'enqueue_own_text_moderation_job') {
          return { data: { jobId: 'job-1', status: 'pending' }, error: null };
        }
        if (name === 'get_own_text_moderation_job') {
          return { data: { jobId: 'job-1', status: 'rejected', decision: 'CONTENT_NOT_ALLOWED' }, error: null };
        }
        return { data: null, error: { message: `unexpected rpc ${name}` } };
      });

      await expect(
        sendTextMessage({ receiverId: 'peer-456', body: 'Cześć' })
      ).rejects.toMatchObject({
        code: 'CONTENT_NOT_ALLOWED',
        message: 'Ta wiadomość nie może zostać wysłana.',
      });
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  describe('fetchTextMessagesWithPeer', () => {
    it('wywołuje RPC fetch_text_messages_with_peer i mapuje wyniki', async () => {
      const mockRows = [
        {
          id: 'msg-1',
          sender_id: 'user-123',
          receiver_id: 'peer-456',
          body: 'Cześć!',
          created_at: '2026-07-24T12:00:00Z',
          expires_at: '2026-07-25T12:00:00Z',
          client_message_id: 'c1',
        },
      ];
      mockSupabaseRpc.mockResolvedValue({ data: mockRows, error: null });

      const messages = await fetchTextMessagesWithPeer({ peerId: 'peer-456', limit: 20 });

      expect(mockSupabaseRpc).toHaveBeenCalledWith('fetch_text_messages_with_peer', {
        peer_id: 'peer-456',
        before_created_at: null,
        msg_limit: 20,
      });
      expect(messages).toEqual(mockRows.map((row) => ({ ...row, metadata: null })));
    });
  });

  describe('deleteTextMessageConversation', () => {
    it('wywołuje RPC delete_my_conversation_with_peer i zwraca usuniętą liczbę rekordów', async () => {
      mockSupabaseRpc.mockResolvedValue({ data: 3, error: null });

      const count = await deleteTextMessageConversation('peer-456');

      expect(mockSupabaseRpc).toHaveBeenCalledWith('delete_my_conversation_with_peer', {
        peer_profile_id: 'peer-456',
      });
      expect(count).toBe(3);
    });
  });

  describe('fetchRecentTextMessagesForInbox', () => {
    it('zwraca wiadomości z obliczonym peer_id', async () => {
      mockSelectOrGtOrderLimit.mockResolvedValue({
        data: [
          {
            id: 'm1',
            sender_id: 'user-123',
            receiver_id: 'peer-A',
            body: 'Siemanko',
            created_at: '2026-07-24T12:00:00Z',
            expires_at: '2026-07-25T12:00:00Z',
            client_message_id: null,
          },
          {
            id: 'm2',
            sender_id: 'peer-B',
            receiver_id: 'user-123',
            body: 'Hej!',
            created_at: '2026-07-24T11:00:00Z',
            expires_at: '2026-07-25T11:00:00Z',
            client_message_id: null,
          },
        ],
        error: null,
      });

      const list = await fetchRecentTextMessagesForInbox();

      expect(list).toHaveLength(2);
      expect(list[0].peer_id).toBe('peer-A');
      expect(list[1].peer_id).toBe('peer-B');
    });
  });
});

describe('fetchRecentTextMessagesWithPeer', () => {
  const row = (id: number) => ({
    id: `m-${id}`,
    sender_id: 'peer',
    receiver_id: 'me',
    body: 'x',
    created_at: new Date(Date.UTC(2026, 9, 10, 12, 0, id)).toISOString(),
    expires_at: new Date(Date.UTC(2026, 9, 11, 12, 0, id)).toISOString(),
  });

  it('walks pages newest first with fresh cursors and stops at a short page', async () => {
    mockSupabaseRpc.mockReset();
    mockSupabaseRpc
      .mockResolvedValueOnce({ data: [row(4), row(3)], error: null })
      .mockResolvedValueOnce({ data: [row(2)], error: null });

    const rows = await fetchRecentTextMessagesWithPeer('peer', 3, 2);

    expect(rows.map((message) => message.id)).toEqual(['m-4', 'm-3', 'm-2']);
    expect(mockSupabaseRpc).toHaveBeenCalledTimes(2);
    expect(mockSupabaseRpc.mock.calls[0][1]).toMatchObject({ before_created_at: null, msg_limit: 2 });
    expect(mockSupabaseRpc.mock.calls[1][1]).toMatchObject({ before_created_at: row(3).created_at });
  });
});

describe('inbox text row mapping', () => {
  const row = {
    id: 'text-1',
    sender_id: 'peer-1',
    receiver_id: 'me-1',
    body: 'hej',
    created_at: '2026-10-10T10:00:00.000000+00:00',
    expires_at: '2026-10-11T10:00:00.000000+00:00',
    client_message_id: null,
    is_system: false,
    metadata: ['not', 'an', 'object'],
  };

  it('maps the multi-query row and the get_inbox_bundle row identically', () => {
    const fromQuery = mapRecentTextMessageRow(row, 'me-1');
    const fromRpc = mapRecentTextMessageRpcRow({ ...row, peer_id: 'peer-1' });

    expect(fromQuery).toEqual(fromRpc);
    expect(fromQuery.peer_id).toBe('peer-1');
    expect(fromQuery.metadata).toBeNull();
  });

  it('uses the receiver as peer for own messages', () => {
    expect(
      mapRecentTextMessageRow({ ...row, sender_id: 'me-1', receiver_id: 'peer-2' }, 'me-1').peer_id
    ).toBe('peer-2');
  });
});

describe('cancelOwnTextMessage', () => {
  it('passes the receiver and client id and returns the server outcome', async () => {
    mockSupabaseRpc.mockReset();
    mockSupabaseRpc.mockResolvedValueOnce({ data: 'cancelled', error: null });

    await expect(cancelOwnTextMessage('peer', 'outbox-1')).resolves.toBe('cancelled');
    expect(mockSupabaseRpc).toHaveBeenCalledWith('cancel_own_text_moderation_job', {
      p_receiver_id: 'peer',
      p_client_message_id: 'outbox-1',
    });
  });

  it('rejects unknown outcomes instead of treating them as cancelled', async () => {
    mockSupabaseRpc.mockReset();
    mockSupabaseRpc.mockResolvedValueOnce({ data: 'maybe', error: null });

    await expect(cancelOwnTextMessage('peer', 'outbox-1')).rejects.toMatchObject({ code: 'UNKNOWN' });
  });
});
