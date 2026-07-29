import { supabase } from '../lib/supabase';

export async function getUnreadInboxCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_unread_inbox_count');
  if (error) throw error;
  return Math.max(0, Math.min(999, Number(data) || 0));
}

export async function markTextConversationRead(
  peerId: string,
  readThrough: string
): Promise<string> {
  const { data, error } = await supabase.rpc('mark_text_conversation_read', {
    peer_id: peerId,
    read_through: readThrough,
  });
  if (error) throw error;
  return typeof data === 'string' ? data : readThrough;
}

export async function listConversationReadStates() {
  const { data, error } = await supabase
    .from('conversation_read_states')
    .select('peer_id,last_read_at');
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.peer_id, row.last_read_at] as const));
}
