import { supabase } from '../lib/supabase';
import { DomainError } from './errors';
import type { MessageReaction, MessageReactionEmoji } from '../types/database.types';
import { MESSAGE_REACTION_EMOJIS } from '../types/database.types';

export { MESSAGE_REACTION_EMOJIS };
export type { MessageReactionEmoji };

export const MESSAGE_REACTION_GLYPHS: Record<MessageReactionEmoji, string> = {
  heart: '❤️',
  thumbsup: '👍',
  thumbsdown: '👎',
  hahaha: '😂',
  exclamation: '‼️',
  question: '❓',
};

function isMessageReactionEmoji(value: string): value is MessageReactionEmoji {
  return (MESSAGE_REACTION_EMOJIS as readonly string[]).includes(value);
}

function mapReactionRow(row: {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  updated_at: string;
}): MessageReaction {
  if (!isMessageReactionEmoji(row.emoji)) {
    throw new DomainError('UNKNOWN', `Nieobsługiwana reakcja: ${row.emoji}`);
  }
  return {
    id: row.id,
    message_id: row.message_id,
    user_id: row.user_id,
    emoji: row.emoji,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function fetchMessageReactionsWithPeer(peerId: string): Promise<MessageReaction[]> {
  const { data, error } = await supabase.rpc('fetch_message_reactions_with_peer', {
    peer_id: peerId,
  });

  if (error) {
    throw new DomainError('UNKNOWN', error.message || 'Błąd pobierania reakcji.');
  }

  return (data || []).map(mapReactionRow);
}

export async function upsertMessageReaction(
  messageId: string,
  emoji: MessageReactionEmoji
): Promise<MessageReaction> {
  const { data, error } = await supabase.rpc('upsert_message_reaction', {
    p_message_id: messageId,
    p_emoji: emoji,
  });

  if (error) {
    throw new DomainError('UNKNOWN', error.message || 'Nie udało się dodać reakcji.');
  }

  if (!data) {
    throw new DomainError('UNKNOWN', 'Nie udało się dodać reakcji.');
  }

  return mapReactionRow(data as {
    id: string;
    message_id: string;
    user_id: string;
    emoji: string;
    created_at: string;
    updated_at: string;
  });
}

export async function removeMessageReaction(messageId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('remove_message_reaction', {
    p_message_id: messageId,
  });

  if (error) {
    throw new DomainError('UNKNOWN', error.message || 'Nie udało się usunąć reakcji.');
  }

  return Boolean(data);
}

/** Toggle: ta sama reakcja → usuń; inna / brak → upsert. */
export async function toggleMessageReaction(params: {
  messageId: string;
  emoji: MessageReactionEmoji;
  currentUserEmoji: MessageReactionEmoji | null;
}): Promise<'added' | 'updated' | 'removed'> {
  const { messageId, emoji, currentUserEmoji } = params;
  if (currentUserEmoji === emoji) {
    await removeMessageReaction(messageId);
    return 'removed';
  }
  await upsertMessageReaction(messageId, emoji);
  return currentUserEmoji ? 'updated' : 'added';
}

export function groupReactionsByMessageId(
  reactions: readonly MessageReaction[]
): Map<string, MessageReaction[]> {
  const map = new Map<string, MessageReaction[]>();
  for (const reaction of reactions) {
    const list = map.get(reaction.message_id);
    if (list) list.push(reaction);
    else map.set(reaction.message_id, [reaction]);
  }
  return map;
}
