import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  sendTextMessage,
  fetchTextMessagesWithPeer,
  deleteTextMessageConversation,
  fetchRecentTextMessagesForInbox,
} from './textMessageService';

const {
  mockGetCurrentUser,
  mockSupabaseRpc,
  mockInsertSelectSingle,
  mockSelectOrGtOrderLimit,
  mockFunctionsInvoke,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockSupabaseRpc: vi.fn(),
  mockInsertSelectSingle: vi.fn(),
  mockSelectOrGtOrderLimit: vi.fn(),
  mockFunctionsInvoke: vi.fn(),
}));

vi.mock('./profileService', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: mockSupabaseRpc,
    functions: {
      invoke: mockFunctionsInvoke,
    },
    from: (table: string) => {
      if (table === 'text_messages') {
        return {
          insert: () => ({
            select: () => ({
              single: mockInsertSelectSingle,
            }),
          }),
          select: () => ({
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
  },
}));

function functionsError(code: string, status = 503) {
  return {
    data: null,
    error: {
      message: 'Edge Function error',
      context: new Response(JSON.stringify({ code }), { status }),
    },
  };
}

const mockMessage = {
  id: 'msg-1',
  sender_id: 'user-123',
  receiver_id: 'peer-456',
  body: 'Cześć!',
  created_at: '2026-07-24T12:00:00Z',
  expires_at: '2026-07-25T12:00:00Z',
  client_message_id: 'client-1',
};

describe('textMessageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123', email: 'test@example.com' });
    mockFunctionsInvoke.mockResolvedValue(functionsError('MODERATION_DISABLED'));
  });

  describe('sendTextMessage', () => {
    it('rzuca błąd gdy treść jest pusta', async () => {
      await expect(
        sendTextMessage({ receiverId: 'peer-456', body: '   ' })
      ).rejects.toThrow('Wiadomość nie może być pusta');
      expect(mockFunctionsInvoke).not.toHaveBeenCalled();
      expect(mockInsertSelectSingle).not.toHaveBeenCalled();
    });

    it('rzuca błąd gdy treść przekracza 2000 znaków', async () => {
      const longBody = 'a'.repeat(2001);
      await expect(
        sendTextMessage({ receiverId: 'peer-456', body: longBody })
      ).rejects.toThrow('Wiadomość przekracza limit 2000 znaków');
      expect(mockInsertSelectSingle).not.toHaveBeenCalled();
    });

    it('przy MODERATION_DISABLED wstawia wiadomość bezpośrednim INSERT', async () => {
      mockInsertSelectSingle.mockResolvedValue({ data: mockMessage, error: null });

      const result = await sendTextMessage({
        receiverId: 'peer-456',
        body: 'Cześć!',
        clientMessageId: 'client-1',
      });

      expect(result).toEqual(mockMessage);
      expect(mockFunctionsInvoke).toHaveBeenCalledOnce();
      expect(mockInsertSelectSingle).toHaveBeenCalledOnce();
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

    it('przy włączonej fladze nie robi INSERT po MODERATION_RETRYABLE', async () => {
      mockFunctionsInvoke.mockResolvedValue(functionsError('MODERATION_RETRYABLE', 503));

      await expect(
        sendTextMessage({ receiverId: 'peer-456', body: 'Cześć!' })
      ).rejects.toMatchObject({
        code: 'MODERATION_RETRYABLE',
      });
      expect(mockInsertSelectSingle).not.toHaveBeenCalled();
    });

    it('przy włączonej fladze nie robi INSERT po CONTENT_NOT_ALLOWED z Edge', async () => {
      mockFunctionsInvoke.mockResolvedValue(functionsError('CONTENT_NOT_ALLOWED', 403));

      await expect(
        sendTextMessage({ receiverId: 'peer-456', body: 'blokowana-tresc-testowa' })
      ).rejects.toMatchObject({
        code: 'CONTENT_NOT_ALLOWED',
      });
      expect(mockInsertSelectSingle).not.toHaveBeenCalled();
    });

    it('przy włączonej fladze nie robi INSERT w stanie MODERATION_PENDING', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { ok: true, status: 'moderation_pending', jobId: 'job-1' },
        error: null,
      });

      await expect(
        sendTextMessage({ receiverId: 'peer-456', body: 'Cześć!' })
      ).rejects.toMatchObject({
        code: 'MODERATION_PENDING',
      });
      expect(mockInsertSelectSingle).not.toHaveBeenCalled();
    });

    it('zwraca wiadomość z Edge bez INSERT gdy moderacja zatwierdziła treść', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { ok: true, status: 'approved', message: mockMessage },
        error: null,
      });

      const result = await sendTextMessage({
        receiverId: 'peer-456',
        body: 'Cześć!',
        clientMessageId: 'client-1',
      });

      expect(result).toEqual(mockMessage);
      expect(mockInsertSelectSingle).not.toHaveBeenCalled();
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
      expect(messages).toEqual(mockRows);
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
