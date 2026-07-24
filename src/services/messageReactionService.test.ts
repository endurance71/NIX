import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchMessageReactionsWithPeer,
  groupReactionsByMessageId,
  removeMessageReaction,
  toggleMessageReaction,
  upsertMessageReaction,
} from './messageReactionService';
import type { MessageReaction } from '../types/database.types';

const { mockSupabaseRpc } = vi.hoisted(() => ({
  mockSupabaseRpc: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: mockSupabaseRpc,
  },
}));

describe('messageReactionService', () => {
  beforeEach(() => {
    mockSupabaseRpc.mockReset();
  });

  it('fetchMessageReactionsWithPeer mapuje wyniki RPC', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: [
        {
          id: 'r1',
          message_id: 'm1',
          user_id: 'u1',
          emoji: 'thumbsup',
          created_at: '2026-07-24T12:00:00Z',
          updated_at: '2026-07-24T12:00:00Z',
        },
      ],
      error: null,
    });

    const rows = await fetchMessageReactionsWithPeer('peer-1');
    expect(mockSupabaseRpc).toHaveBeenCalledWith('fetch_message_reactions_with_peer', {
      peer_id: 'peer-1',
    });
    expect(rows).toEqual([
      {
        id: 'r1',
        message_id: 'm1',
        user_id: 'u1',
        emoji: 'thumbsup',
        created_at: '2026-07-24T12:00:00Z',
        updated_at: '2026-07-24T12:00:00Z',
      },
    ]);
  });

  it('upsertMessageReaction wywołuje RPC i zwraca reakcję', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: {
        id: 'r2',
        message_id: 'm2',
        user_id: 'u1',
        emoji: 'heart',
        created_at: '2026-07-24T12:00:00Z',
        updated_at: '2026-07-24T12:01:00Z',
      },
      error: null,
    });

    const row = await upsertMessageReaction('m2', 'heart');
    expect(mockSupabaseRpc).toHaveBeenCalledWith('upsert_message_reaction', {
      p_message_id: 'm2',
      p_emoji: 'heart',
    });
    expect(row.emoji).toBe('heart');
  });

  it('removeMessageReaction zwraca true gdy RPC usunie wiersz', async () => {
    mockSupabaseRpc.mockResolvedValue({ data: true, error: null });
    await expect(removeMessageReaction('m3')).resolves.toBe(true);
    expect(mockSupabaseRpc).toHaveBeenCalledWith('remove_message_reaction', {
      p_message_id: 'm3',
    });
  });

  it('toggleMessageReaction usuwa przy tej samej reakcji', async () => {
    mockSupabaseRpc.mockResolvedValue({ data: true, error: null });
    await expect(
      toggleMessageReaction({
        messageId: 'm4',
        emoji: 'question',
        currentUserEmoji: 'question',
      })
    ).resolves.toBe('removed');
    expect(mockSupabaseRpc).toHaveBeenCalledWith('remove_message_reaction', {
      p_message_id: 'm4',
    });
  });

  it('toggleMessageReaction dodaje gdy brak własnej reakcji', async () => {
    mockSupabaseRpc.mockResolvedValue({
      data: {
        id: 'r5',
        message_id: 'm5',
        user_id: 'u1',
        emoji: 'hahaha',
        created_at: '2026-07-24T12:00:00Z',
        updated_at: '2026-07-24T12:00:00Z',
      },
      error: null,
    });
    await expect(
      toggleMessageReaction({
        messageId: 'm5',
        emoji: 'hahaha',
        currentUserEmoji: null,
      })
    ).resolves.toBe('added');
  });

  it('groupReactionsByMessageId grupuje po message_id', () => {
    const reactions: MessageReaction[] = [
      {
        id: 'a',
        message_id: 'm1',
        user_id: 'u1',
        emoji: 'heart',
        created_at: '2026-07-24T12:00:00Z',
        updated_at: '2026-07-24T12:00:00Z',
      },
      {
        id: 'b',
        message_id: 'm1',
        user_id: 'u2',
        emoji: 'thumbsup',
        created_at: '2026-07-24T12:01:00Z',
        updated_at: '2026-07-24T12:01:00Z',
      },
      {
        id: 'c',
        message_id: 'm2',
        user_id: 'u1',
        emoji: 'question',
        created_at: '2026-07-24T12:02:00Z',
        updated_at: '2026-07-24T12:02:00Z',
      },
    ];
    const grouped = groupReactionsByMessageId(reactions);
    expect(grouped.get('m1')).toHaveLength(2);
    expect(grouped.get('m2')).toHaveLength(1);
  });
});
