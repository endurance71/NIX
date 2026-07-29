import { supabase } from '../lib/supabase';
import type { ConversationMute, NotificationPreferences } from '../types/database.types';

export const DEFAULT_NOTIFICATION_PREFERENCES: Pick<
  NotificationPreferences,
  'messages_enabled' | 'reactions_enabled' | 'friends_enabled'
> = {
  messages_enabled: true,
  reactions_enabled: true,
  friends_enabled: true,
};

export async function getNotificationPreferences() {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data
    ? {
        messages_enabled: data.messages_enabled,
        reactions_enabled: data.reactions_enabled,
        friends_enabled: data.friends_enabled,
      }
    : DEFAULT_NOTIFICATION_PREFERENCES;
}

export async function saveNotificationPreferences(
  preferences: typeof DEFAULT_NOTIFICATION_PREFERENCES
) {
  const { data, error } = await supabase.rpc('set_notification_preferences', {
    p_messages_enabled: preferences.messages_enabled,
    p_reactions_enabled: preferences.reactions_enabled,
    p_friends_enabled: preferences.friends_enabled,
  });
  if (error) throw error;
  return data;
}

export async function getConversationMute(peerId: string): Promise<ConversationMute | null> {
  const { data, error } = await supabase
    .from('conversation_mutes')
    .select('*')
    .eq('peer_user_id', peerId)
    .maybeSingle();
  if (error) throw error;
  if (data?.muted_until && new Date(data.muted_until).getTime() <= Date.now()) return null;
  return data ?? null;
}

export async function setConversationMute(
  peerId: string,
  duration: '1h' | '24h' | 'forever' | 'off'
) {
  const durationMs = duration === '1h' ? 3_600_000 : 86_400_000;
  const mutedUntil =
    duration === '1h' || duration === '24h'
      ? new Date(Date.now() + durationMs).toISOString()
      : null;
  const { error } = await supabase.rpc('set_conversation_mute', {
    p_peer_id: peerId,
    p_muted_until: mutedUntil,
    p_indefinite: duration === 'forever',
  });
  if (error) throw error;
}
